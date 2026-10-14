// Installing Mimic as an app, on iPhone and Android.
//
// Android (Chrome) fires `beforeinstallprompt`, so we can offer a real
// Install button. iPhone (Safari) has no install API: the only way is
// Share → Add to Home Screen, so we show that tip instead. Once installed,
// the app runs full-screen ("standalone") and both tips disappear.

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let deferred = null;
const listeners = new Set();
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  listeners.forEach((fn) => fn());
});
addEventListener('appinstalled', () => { deferred = null; listeners.forEach((fn) => fn()); });

export const canPrompt = () => !!deferred;
export const onInstallChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export async function promptInstall() {
  if (!deferred) return false;
  deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  return outcome === 'accepted';
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
