import WebApp from '@twa-dev/sdk';

function safely(action, fallback) {
  try {
    return action();
  } catch (error) {
    console.warn('Telegram Web App API is unavailable:', error);
    return fallback;
  }
}

export function initTelegramApp() {
  safely(() => WebApp.ready());
  safely(() => WebApp.expand());
  safely(() => WebApp.setHeaderColor('#000000'));
  safely(() => WebApp.setBackgroundColor('#000000'));
  safely(() => WebApp.disableVerticalSwipes?.());

  return WebApp;
}

export function getInitData() {
  return safely(() => WebApp.initData, '') || '';
}

export function getTelegramUser() {
  return safely(() => WebApp.initDataUnsafe?.user, null) || null;
}

export function isTelegramMiniApp() {
  return getInitData().length > 0;
}

export function impact(style = 'light') {
  safely(() => WebApp.HapticFeedback?.impactOccurred(style));
}

export function notify(type = 'success') {
  safely(() => WebApp.HapticFeedback?.notificationOccurred(type));
}

export function closeMiniApp() {
  safely(() => WebApp.close());
}

export default WebApp;
