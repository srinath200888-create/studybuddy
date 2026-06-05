/**
 * StudyBuddy + ZeroScroll — YouTube Shorts Detector
 * Detects Shorts URLs, coordinates tracking and interventions.
 */

(function () {
  'use strict';

  const SHORTS_PATTERN = /\/shorts(?:\/|$)/;
  let isOnShorts = false;
  let urlObserver = null;
  let lastUrl = location.href;

  function isShortsUrl(url) {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes('youtube.com')) return false;
      return SHORTS_PATTERN.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  function wrapHistoryMethod(methodName) {
    const original = history[methodName];
    history[methodName] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('sbzs-url-change'));
      return result;
    };
  }

  function startUrlObserver() {
    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('sbzs-url-change', onUrlChange);

    wrapHistoryMethod('pushState');
    wrapHistoryMethod('replaceState');

    urlObserver = setInterval(() => {
      if (location.href !== lastUrl) {
        onUrlChange();
      }
    }, 1000);
  }

  function stopUrlObserver() {
    window.removeEventListener('popstate', onUrlChange);
    window.removeEventListener('sbzs-url-change', onUrlChange);

    if (urlObserver) {
      clearInterval(urlObserver);
      urlObserver = null;
    }
  }

  async function enterShorts(url) {
    if (isOnShorts) {
      await ShortsTracker.handleVideoChange(url);
      return;
    }

    isOnShorts = true;
    InterventionManager.reset();
    await InterventionManager.loadSettings();
    await ShortsTracker.start(url);
  }

  async function leaveShorts() {
    if (!isOnShorts) return;

    isOnShorts = false;
    await ShortsTracker.stop();
    InterventionManager.reset();
  }

  async function onUrlChange() {
    const currentUrl = location.href;
    lastUrl = currentUrl;

    if (isShortsUrl(currentUrl)) {
      await enterShorts(currentUrl);
    } else {
      await leaveShorts();
    }
  }

  function onVisibilityChange() {
    ShortsTracker.handleVisibilityChange();

    if (!isOnShorts) return;

    if (document.visibilityState === 'visible') {
      ShortsTracker.resume(location.href).catch(() => {});
    } else {
      ShortsTracker.pause().catch(() => {});
    }
  }

  function bindTrackerToInterventions() {
    ShortsTracker.onTick((elapsed) => {
      InterventionManager.handleElapsed(elapsed).catch(() => {});
    });
  }

  async function init() {
    if (window.__sbzsInitialized) return;
    window.__sbzsInitialized = true;

    await InterventionManager.init();
    bindTrackerToInterventions();
    startUrlObserver();

    document.addEventListener('visibilitychange', onVisibilityChange);

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'NOTIFICATION') {
        showPageNotification(message.message, message.variant);
      }
    });

    if (isShortsUrl(location.href)) {
      await enterShorts(location.href);
    }
  }

  function showPageNotification(message, variant) {
    const existing = document.getElementById('sbzs-page-notification');
    if (existing) existing.remove();

    const note = document.createElement('div');
    note.id = 'sbzs-page-notification';
    note.textContent = message;
    note.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 999999;
      padding: 12px 18px;
      border-radius: 10px;
      font-family: Inter, -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #f4f4f5;
      background: ${variant === 'success' ? '#166534' : '#1a1a1e'};
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      animation: sbzs-slide-in 0.3s ease;
    `;

    if (!document.getElementById('sbzs-notif-style')) {
      const style = document.createElement('style');
      style.id = 'sbzs-notif-style';
      style.textContent = `
        @keyframes sbzs-slide-in {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(note);
    setTimeout(() => note.remove(), 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
