// Every user-facing message of the bot, ported 1:1 from
// `backend/src/bot/bot.js` and `backend/src/bot/handlers/notificationHandler.js`
// so the Serverless bot speaks exactly like the main bot.

export const WELCOME_MESSAGE = `Welcome to Dategram 🖤

Answer a few questions about yourself — AI will find those who are perfect for you. ⬇️`;

export const VERIFICATION_NUDGE = `You’re almost there! 🚀 Complete your registration to start meeting amazing people!`;

export const VERIFICATION_INSTRUCTIONS = `One step away from the checkmark ✅

1️⃣ Press and hold the camera button in the bottom right corner.
2️⃣ Smile at the camera and slowly turn your head to the side.

💡 If you see a microphone icon, tap it once to switch to the camera.

I'm waiting for your video right here! 🤳`;

export const VERIFICATION_RECEIVED = `Got your video! ✅ Our team will review it shortly — you’ll see the badge on your profile as soon as you’re verified.`;

export const HELP_MESSAGE = `Dategram help 🖤

🤖 Commands:
/start — open Dategram
/verify — get the verified badge
/vip — what VIP gives you
/app — open the Mini App
/about — what Dategram is

📸 Verification: send /verify and follow the steps, then record a video note (circular video) right here in this chat.

❤️ Likes, matches and messages arrive here as notifications — tap them to jump straight into the app.`;

export const ABOUT_MESSAGE = `Dategram — dating with intention, right inside Telegram. 🖤

Verified profiles, AI daily picks, mutual matches and real-time chat. Built for Addis Ababa and beyond.

Tap below to open the app ⬇️`;

export const VIP_INFO_MESSAGE = `Dategram VIP ⭐

👀 See who liked you
❤️ More likes and super-likes
💬 More messages to people you liked
↩️ Undo your last swipe
✨ Smart AI tools to find your match
🚀 Your profile gets seen and liked more often

Open the app to activate VIP from your profile.`;

export const UNKNOWN_COMMAND_MESSAGE = `I don’t know that command 🤔 Tap below to open Dategram, or send /help to see what I can do.`;

export const PLAIN_TEXT_REPLY = `Nice 👍 I’m just the Dategram helper bot — chatting happens inside the app with your matches. Tap below to jump back in ⬇️`;

export const VIP_CAMPAIGN_MESSAGE = `🎁 Congratulations! Your VIP access is activated!
We're giving you VIP in Dategram! Now you have access to:
👀 See who liked you
❤️ More likes and skips
💬 More messages to people you liked
⭐ More super-likes
↩️ Undo your last swipe
✨ Smart AI tools to find your match
🚀 Your profile gets seen and liked more often
Open the app and enjoy your gift!`;

// --- Notification builders (same wording as notificationHandler.js) ---

export function likeCaption({ isVip, likerName }) {
  if (isVip) return `${likerName} just liked you! Open Dategram to respond.`;
  return 'Someone just liked you! Open Dategram to see your free preview or unlock the rest with VIP.';
}

export function matchText(matchedName) {
  return `🎉 It's a match! You and ${matchedName} liked each other. Open Dategram to start chatting!`;
}

export function chatPreviewText(senderName, content, maxLength = 72) {
  const clean = String(content || '').trim();
  const chars = Array.from(clean);
  const preview = chars.slice(0, maxLength).join('');
  const suffix = chars.length > maxLength ? '…' : '';
  return `💬 ${senderName}: “${preview}${suffix}”`;
}
