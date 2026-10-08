import { Router } from 'express';
import {
  REJECTION_REASONS,
  VERIFICATION_APPROVED_MESSAGE,
  isValidRejectionReason,
  rejectionMessage,
} from '../bot/messages/verificationMessages.js';
import { createAdminAuthMiddleware } from '../middleware/adminAuth.js';

function unavailableResponse(res) {
  return res.status(503).json({
    error: {
      code: 'DATABASE_UNAVAILABLE',
      message: 'Dategram persistence is not configured yet.',
    },
  });
}

function notFoundResponse(res) {
  return res.status(404).json({
    error: { code: 'SUBMISSION_NOT_FOUND', message: 'Verification submission not found.' },
  });
}

/**
 * Admin review of verification videos.
 *
 * A `file_id` on its own is unreadable, so the review queue also exposes the video itself —
 * without it, manual review would be impossible. Everything here sits behind adminAuth, and the
 * router is only mounted when an admin token is configured.
 */
export function createAdminRouter({
  verificationRepository,
  notifier,
  runtimeConfig,
  fetchImpl = fetch,
}) {
  const router = Router();
  const requireAdmin = createAdminAuthMiddleware(runtimeConfig);

  router.use(requireAdmin);

  router.get('/verification/pending', async (req, res, next) => {
    try {
      if (!verificationRepository.isAvailable) return unavailableResponse(res);
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '50', 10) || 50, 1), 200);
      const submissions = await verificationRepository.listPending(limit);
      return res.json({ success: true, submissions });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/verification/:id/file', async (req, res, next) => {
    try {
      if (!verificationRepository.isAvailable) return unavailableResponse(res);
      if (!notifier?.isAvailable) {
        return res.status(503).json({
          error: { code: 'BOT_UNAVAILABLE', message: 'The bot is not configured, so the video cannot be fetched.' },
        });
      }

      const submission = await verificationRepository.getSubmission(req.params.id);
      if (!submission) return notFoundResponse(res);

      const file = await notifier.getFile(submission.fileId);
      if (!file?.file_path) {
        return res.status(502).json({
          error: { code: 'FILE_UNAVAILABLE', message: 'Telegram did not return a downloadable path.' },
        });
      }

      const upstream = await fetchImpl(notifier.fileUrl(file.file_path));
      if (!upstream.ok) {
        return res.status(502).json({
          error: { code: 'FILE_FETCH_FAILED', message: 'Could not download the video from Telegram.' },
        });
      }

      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'video/mp4');
      const length = upstream.headers.get('content-length');
      if (length) res.setHeader('Content-Length', length);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Never let a review artifact be cached or embedded outside the admin session.
      res.setHeader('Cache-Control', 'no-store');

      const body = upstream.body;
      if (typeof body?.pipeTo === 'function') {
        return await new Promise((resolve) => {
          body.pipeTo(new WritableStream({
            write(chunk) {
              res.write(chunk);
            },
            close() {
              res.end();
              resolve();
            },
            abort() {
              res.end();
              resolve();
            },
          })).catch(() => {
            res.end();
            resolve();
          });
        });
      }

      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.end(buffer);
      return undefined;
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/verification/:id/approve', async (req, res, next) => {
    try {
      if (!verificationRepository.isAvailable) return unavailableResponse(res);

      const outcome = await verificationRepository.approve(req.params.id, req.admin.identifier);
      if (outcome.status === 'not-found') return notFoundResponse(res);
      if (outcome.status === 'already-reviewed') {
        return res.status(409).json({
          error: {
            code: 'ALREADY_REVIEWED',
            message: `This submission was already ${outcome.submission.status}.`,
          },
        });
      }

      if (notifier?.isAvailable) {
        // Notification failure must not roll back an approval that already committed.
        try {
          await notifier.sendMessage(outcome.telegramId, VERIFICATION_APPROVED_MESSAGE);
        } catch (error) {
          console.error('Failed to send approval notification:', error.message);
          return res.json({ success: true, notified: false, warning: error.message });
        }
      }

      return res.json({ success: true, notified: Boolean(notifier?.isAvailable) });
    } catch (error) {
      return next(error);
    }
  });

  router.patch('/verification/:id/reject', async (req, res, next) => {
    try {
      if (!verificationRepository.isAvailable) return unavailableResponse(res);

      const reason = req.body?.reason;
      if (!isValidRejectionReason(reason)) {
        return res.status(422).json({
          error: {
            code: 'INVALID_REASON',
            message: 'Provide a rejection reason key from the catalogue.',
            allowed: Object.keys(REJECTION_REASONS),
          },
        });
      }

      const outcome = await verificationRepository.reject(req.params.id, reason, req.admin.identifier);
      if (outcome.status === 'not-found') return notFoundResponse(res);
      if (outcome.status === 'already-reviewed') {
        return res.status(409).json({
          error: {
            code: 'ALREADY_REVIEWED',
            message: `This submission was already ${outcome.submission.status}.`,
          },
        });
      }

      if (notifier?.isAvailable) {
        try {
          await notifier.sendMessage(outcome.telegramId, rejectionMessage(reason));
        } catch (error) {
          console.error('Failed to send rejection notification:', error.message);
          return res.json({ success: true, notified: false, warning: error.message });
        }
      }

      return res.json({ success: true, notified: Boolean(notifier?.isAvailable) });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

export { rejectionMessage };
