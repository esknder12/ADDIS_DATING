import { Router } from 'express';
import { validateDisplayName } from '@dategram/shared/results';
import { cloudinary, cloudinaryConfigured, profilePhotoUpload } from '../config/cloudinary.js';
import { createTelegramAuthMiddleware } from '../middleware/telegramAuth.js';

const profileUnavailable = (res) => res.status(503).json({
  error: { code: 'DATABASE_UNAVAILABLE', message: 'Dategram persistence is not configured yet.' },
});

const userNotFound = (res) => res.status(404).json({
  error: { code: 'USER_NOT_FOUND', message: 'Dategram profile not found.' },
});

function validPhotoId(value) {
  const text = String(value ?? '');
  if (!/^[1-9]\d{0,18}$/.test(text)) return false;
  try {
    return BigInt(text) <= 9_223_372_036_854_775_807n;
  } catch {
    return false;
  }
}

function validateAdditionalInfo(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 20) return false;
  return entries.every(([key, item]) => {
    if (!key.trim() || key.length > 60) return false;
    if (typeof item === 'string') return item.length <= 500;
    if (Array.isArray(item)) {
      return item.length <= 20 && item.every((entry) => typeof entry === 'string' && entry.length <= 160);
    }
    return item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item));
  });
}

function uploadPhoto(req, res, next) {
  if (!cloudinaryConfigured) {
    return res.status(503).json({
      error: {
        code: 'PHOTO_STORAGE_UNAVAILABLE',
        message: 'Photo uploads are not configured yet. Please try again later.',
      },
    });
  }

  return profilePhotoUpload.single('photo')(req, res, (error) => {
    if (!error) return next();
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: { code: 'PHOTO_TOO_LARGE', message: 'Photos must be 5 MB or smaller.' },
      });
    }
    if (error.code === 'INVALID_PHOTO_TYPE' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(422).json({
        error: { code: 'INVALID_PHOTO_TYPE', message: 'Upload one JPG, PNG, or WebP image.' },
      });
    }
    console.error('Cloudinary photo upload failed:', error.message);
    return res.status(502).json({
      error: { code: 'PHOTO_UPLOAD_FAILED', message: 'Photo upload failed. Please try again.' },
    });
  });
}

export function createProfileRouter({ appRepository, runtimeConfig }) {
  const router = Router();
  router.use(createTelegramAuthMiddleware(runtimeConfig));

  function requireRepository(res) {
    if (!appRepository.isAvailable) {
      profileUnavailable(res);
      return false;
    }
    return true;
  }

  router.get('/', async (req, res, next) => {
    try {
      if (!requireRepository(res)) return;
      const profile = await appRepository.getOwnProfile(req.telegramUser.id);
      if (!profile) return userNotFound(res);
      return res.json({ success: true, profile });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/', async (req, res, next) => {
    try {
      if (!requireRepository(res)) return;
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const allowedFields = new Set(['name', 'bio', 'city', 'country', 'additionalInfo', 'settings']);
      if (Object.keys(body).some((key) => !allowedFields.has(key))) {
        return res.status(422).json({
          error: { code: 'INVALID_INPUT', message: 'Only your name, bio, location, and additional information can be changed here.' },
        });
      }

      const patch = {};
      if (Object.hasOwn(body, 'name')) {
        const checked = validateDisplayName(body.name);
        if (!checked.valid) {
          return res.status(422).json({ error: { code: 'INVALID_NAME', message: checked.error } });
        }
        patch.name = checked.value;
      }
      for (const field of ['bio', 'city', 'country']) {
        if (!Object.hasOwn(body, field)) continue;
        if (typeof body[field] !== 'string') {
          return res.status(422).json({
            error: { code: 'INVALID_INPUT', message: `${field} must be text.` },
          });
        }
        const value = body[field].trim();
        const limit = field === 'bio' ? 500 : 120;
        if (value.length > limit) {
          return res.status(422).json({
            error: { code: 'INVALID_INPUT', message: `${field} must be ${limit} characters or fewer.` },
          });
        }
        patch[field] = value;
      }
      if (Object.hasOwn(body, 'additionalInfo')) {
        if (!validateAdditionalInfo(body.additionalInfo)) {
          return res.status(422).json({
            error: { code: 'INVALID_ADDITIONAL_INFO', message: 'Additional information is not valid.' },
          });
        }
        patch.additionalInfo = body.additionalInfo;
      }
      if (Object.hasOwn(body, 'settings')) {
        const settings = body.settings;
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)
            || Object.keys(settings).some((key) => key !== 'notificationsEnabled')
            || typeof settings.notificationsEnabled !== 'boolean') {
          return res.status(422).json({
            error: { code: 'INVALID_SETTINGS', message: 'Settings are not valid.' },
          });
        }
        patch.settings = settings;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(422).json({
          error: { code: 'INVALID_INPUT', message: 'Add at least one profile field to update.' },
        });
      }

      const profile = await appRepository.updateOwnProfile(req.telegramUser.id, patch);
      if (!profile) return userNotFound(res);
      return res.json({ success: true, profile });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/photos', (req, res, next) => {
    if (!requireRepository(res)) return;
    return next();
  }, uploadPhoto, async (req, res, next) => {
    if (!req.file?.path) {
      return res.status(422).json({
        error: { code: 'PHOTO_REQUIRED', message: 'Choose a photo to upload.' },
      });
    }

    const publicId = req.file.filename || req.file.public_id || req.file.publicId || null;
    let result;
    try {
      result = await appRepository.addProfilePhoto(req.telegramUser.id, {
        url: req.file.path,
        publicId,
      });
    } catch (error) {
      if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
      return next(error);
    }
    if (result?.error === 'PHOTO_LIMIT') {
      if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
      return res.status(409).json({
        error: { code: 'PHOTO_LIMIT', message: 'You can add up to six profile photos.' },
      });
    }
    if (result?.error === 'USER_NOT_FOUND') {
      if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
      return userNotFound(res);
    }
    try {
      const profile = await appRepository.getOwnProfile(req.telegramUser.id);
      return res.status(201).json({ success: true, photo: result.photo, profile });
    } catch (error) {
      return next(error);
    }
  });

  router.delete('/photos/:photoId', async (req, res, next) => {
    try {
      if (!requireRepository(res)) return;
      if (!validPhotoId(req.params.photoId)) {
        return res.status(404).json({
          error: { code: 'PHOTO_NOT_FOUND', message: 'This photo is not in your profile.' },
        });
      }
      const result = await appRepository.deleteProfilePhoto(req.telegramUser.id, req.params.photoId);
      if (!result) {
        return res.status(404).json({
          error: { code: 'PHOTO_NOT_FOUND', message: 'This photo is not in your profile.' },
        });
      }
      if (result.publicId) {
        try {
          await cloudinary.uploader.destroy(result.publicId);
        } catch (error) {
          console.warn('Photo was removed from the profile, but Cloudinary cleanup failed:', error.message);
        }
      }
      const profile = await appRepository.getOwnProfile(req.telegramUser.id);
      return res.json({ success: true, profile });
    } catch (error) {
      return next(error);
    }
  });

  router.put('/photos/reorder', async (req, res, next) => {
    try {
      if (!requireRepository(res)) return;
      const photoIds = req.body?.photoIds;
      if (!Array.isArray(photoIds) || photoIds.length > 6
          || photoIds.some((id) => !validPhotoId(id))) {
        return res.status(422).json({
          error: { code: 'INVALID_PHOTO_ORDER', message: 'Send the complete ordered list of your photo IDs.' },
        });
      }
      const result = await appRepository.reorderProfilePhotos(req.telegramUser.id, photoIds);
      if (!result) return userNotFound(res);
      if (result.error === 'INVALID_PHOTO_ORDER') {
        return res.status(422).json({
          error: { code: 'INVALID_PHOTO_ORDER', message: 'Send every profile photo exactly once.' },
        });
      }
      const profile = await appRepository.getOwnProfile(req.telegramUser.id);
      return res.json({ success: true, profile });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/score', async (req, res, next) => {
    try {
      if (!requireRepository(res)) return;
      const score = await appRepository.getProfileScore(req.telegramUser.id);
      if (!score) return userNotFound(res);
      return res.json({ success: true, ...score });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/score/request', async (req, res, next) => {
    try {
      if (!requireRepository(res)) return;
      const score = await appRepository.requestProfileScore(req.telegramUser.id);
      if (!score) return userNotFound(res);
      return res.json({ success: true, ...score });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}
