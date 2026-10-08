// Copy is taken verbatim from docs/DATEGRAM_PRODUCT_SPEC.md §5 (V2) so the bot and the
// specification cannot drift apart.

export const VERIFICATION_PINNED_MESSAGE = "You're almost there! 🚀 Complete your registration to start meeting amazing people!";

export const VERIFICATION_RETURN_BUTTON_LABEL = 'Return to Dategram 🖤';

export const VERIFICATION_INSTRUCTIONS = `One step away from the checkmark ✅

1️⃣ Press and hold the camera button in the bottom right corner.
2️⃣ Smile at the camera and slowly turn your head to the side.

💡 If you see a microphone icon, tap it once to switch to the camera.

I'm waiting for your video right here! 🤳`;

export const VERIFICATION_RECEIVED_CONFIRMATION = `Got it! 🎉

Your video is being reviewed. This usually takes a few minutes — we'll notify you right here as soon as you're verified! ✅`;

export const VERIFICATION_DUPLICATE_MESSAGE = `We already have your video 🤳

It's still in the review queue — no need to send another one. We'll message you here as soon as it's done.`;

export const VERIFICATION_APPROVED_MESSAGE = `🎉 You're verified!

Your profile now has a verified badge — this helps you get more matches and builds trust with other members.`;

export const VERIFICATION_REJECTED_MESSAGE = `Hmm, we couldn't verify your video 😕

Reason: {reason}

Please try again — make sure your face is clearly visible and well-lit.`;

/**
 * Rejection reasons come from a fixed catalogue rather than free text, so the message the user
 * receives is always coherent and the data stays analysable. Free text is stored separately as
 * a reviewer note.
 */
export const REJECTION_REASONS = {
  blurry: 'the video is too blurry to confirm your face',
  not_a_selfie: 'the video does not show you facing the camera',
  face_not_visible: 'your face is not clearly visible',
  too_short: 'the video is too short — please turn your head slowly',
  poor_lighting: 'the lighting makes it hard to confirm your face',
  other: 'we could not confirm your identity from this video',
};

export function isValidRejectionReason(reason) {
  return typeof reason === 'string' && Object.hasOwn(REJECTION_REASONS, reason);
}

export function rejectionMessage(reason) {
  const text = REJECTION_REASONS[reason] || REJECTION_REASONS.other;
  return VERIFICATION_REJECTED_MESSAGE.replace('{reason}', text);
}
