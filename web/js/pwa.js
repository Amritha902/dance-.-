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

// Auto-update: check for a new version on every launch and whenever the app
// comes back to the foreground; when a new one takes over, reload once so the
// whole app is on the same version.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    sessionStorage.setItem('mimic.updated', '1');
    location.reload();
  });
  addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      reg.update().catch(() => {});
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    } catch { /* the app still works without it */ }
  });
}
export function takeUpdatedFlag() {
  const was = sessionStorage.getItem('mimic.updated') === '1';
  sessionStorage.removeItem('mimic.updated');
  return was;
}
