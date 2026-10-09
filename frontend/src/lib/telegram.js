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

export function showTelegramMainButton(text, onClick) {
  safely(() => {
    WebApp.MainButton.setText(text);
    WebApp.MainButton.onClick(onClick);
    WebApp.MainButton.show();
    WebApp.MainButton.enable();
  });
  return () => safely(() => {
    WebApp.MainButton.offClick(onClick);
    WebApp.MainButton.hideProgress();
    WebApp.MainButton.hide();
  });
}

export function setTelegramMainButtonEnabled(enabled) {
  safely(() => (enabled ? WebApp.MainButton.enable() : WebApp.MainButton.disable()));
}

export function setTelegramMainButtonLoading(loading) {
  safely(() => {
    if (loading) {
      WebApp.MainButton.showProgress(false);
      WebApp.MainButton.disable();
    } else {
      WebApp.MainButton.hideProgress();
      WebApp.MainButton.enable();
    }
  });
}

export function showTelegramBackButton(onClick) {
  safely(() => {
    WebApp.BackButton.onClick(onClick);
    WebApp.BackButton.show();
  });
  return () => safely(() => {
    WebApp.BackButton.offClick(onClick);
    WebApp.BackButton.hide();
  });
}

export default WebApp;
