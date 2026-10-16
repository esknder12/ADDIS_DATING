// Client-side human-face gate for profile photos (Build A).
//
// Uses the TinyFaceDetector model (~190 KB, bundled in public/models) via the
// maintained @vladmandic/face-api fork. The library is lazy-loaded so the TF.js
// chunk only downloads when a user actually picks a photo — the main bundle
// stays lean.
//
// NOTE: this runs on-device, so it is a UX guard, not tamper-proof moderation.
// Server-side enforcement (Cloudinary adv_face) is planned for production.

export const FACE_MIN_SCORE = 0.5;
// The detected face box must cover at least this fraction of the photo area,
// otherwise the face is not "clearly visible" (e.g. landscapes, statues).
export const FACE_MIN_AREA_RATIO = 0.05;

let loadPromise = null;

async function loadFaceApi() {
  if (!loadPromise) {
    loadPromise = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const modelUrl = `${import.meta.env.BASE_URL}models`;
      await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl);
      return faceapi;
    })();
  }
  return loadPromise;
}

/**
 * Check an already-loaded image element for a clearly visible human face.
 * Resolves { ok: true, score, ratio } or { ok: false, reason } where reason is
 * 'none' (no face found) or 'small' (face too small in frame).
 * Rejects if the model cannot load — callers should fail open (see below).
 */
export async function checkFace(image) {
  const faceapi = await loadFaceApi();
  const detection = await faceapi.detectSingleFace(
    image,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: FACE_MIN_SCORE }),
  );
  if (!detection?.box) return { ok: false, reason: 'none' };
  const imageWidth = image.naturalWidth || image.width || 1;
  const imageHeight = image.naturalHeight || image.height || 1;
  const ratio = (detection.box.width * detection.box.height) / (imageWidth * imageHeight);
  if (ratio < FACE_MIN_AREA_RATIO) return { ok: false, reason: 'small', ratio };
  return { ok: true, score: detection.score, ratio };
}
