import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';
import { config } from './env.js';

export const cloudinaryConfigured = Boolean(
  config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret,
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret,
    secure: true,
  });
}

const storage = cloudinaryConfigured
  ? {
    _handleFile(_request, file, callback) {
      let finished = false;
      const finish = (error, fileInfo) => {
        if (finished) return;
        finished = true;
        callback(error, fileInfo);
      };
      const uploadStream = cloudinary.uploader.upload_stream({
        folder: 'dategram/profile-photos',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1600, height: 1600, crop: 'limit', quality: 'auto:good' }],
      }, (error, result) => {
        if (error) return finish(error);
        if (!result?.secure_url || !result.public_id) {
          return finish(new Error('Cloudinary returned an incomplete photo response.'));
        }
        return finish(null, {
          path: result.secure_url,
          size: result.bytes,
          filename: result.public_id,
          public_id: result.public_id,
        });
      });
      file.stream.on('error', (error) => finish(error));
      uploadStream.on('error', (error) => finish(error));
      file.stream.pipe(uploadStream);
    },
    _removeFile(_request, file, callback) {
      cloudinary.uploader.destroy(file.filename, { invalidate: true })
        .then(() => callback(null))
        .catch(callback);
    },
  }
  : multer.memoryStorage();

export const profilePhotoUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(_request, file, callback) {
    const accepted = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!accepted.has(file.mimetype)) {
      const error = new Error('Upload a JPG, PNG, or WebP image.');
      error.code = 'INVALID_PHOTO_TYPE';
      callback(error);
      return;
    }
    callback(null, true);
  },
});

export { cloudinary };
