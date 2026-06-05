/**
 * StudyBuddy + ZeroScroll — Intervention Manager
 * Displays timed overlays and optional blur mode on YouTube Shorts.
 */

const InterventionManager = (function () {
  'use strict';

  const THRESHOLDS = {
    GENTLE: 60,
    REFLECT: 180,
    SWITCH: 300,
    BLUR: 300
  };

  const STYLE_ID = 'sbzs-intervention-styles';
  const ROOT_ID = 'sbzs-intervention-root';

  let blurModeEnabled = false;
  let shownInterventions = new Set();
  let blurActive = false;
  let containerEl = null;

  function sendMessage(type, payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response || !response.success) {
          reject(new Error(response?.error || 'Request failed'));
          return;
        }
        resolve(response.data);
      });
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 999999;
        pointer-events: none;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      #${ROOT_ID} * {
        box-sizing: border-box;
      }

      .sbzs-overlay {
        pointer-events: auto;
      }

      .sbzs-toast {
        position: fixed;
        top: 72px;
        left: 50%;
        transform: translateX(-50%) translateY(-20px);
        background: #1a1a1e;
        color: #f4f4f5;
        border: 1px solid rgba(139, 92, 246, 0.4);
        border-radius: 12px;
        padding: 14px 22px;
        font-size: 15px;
        font-weight: 600;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease;
        max-width: 90vw;
        text-align: center;
        z-index: 1000001;
      }

      .sbzs-toast.visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      .sbzs-card-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.55);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        z-index: 1000000;
        animation: sbzs-fade-in 0.25s ease;
      }

      @keyframes sbzs-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      .sbzs-card {
        background: #141416;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 28px 32px;
        max-width: 420px;
        width: 100%;
        text-align: center;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.6);
      }

      .sbzs-card-title {
        font-size: 20px;
        font-weight: 700;
        color: #f4f4f5;
        margin-bottom: 10px;
        letter-spacing: -0.02em;
      }

      .sbzs-card-body {
        font-size: 14px;
        color: #a1a1aa;
        line-height: 1.6;
        margin-bottom: 24px;
      }

      .sbzs-card-actions {
        display: flex;
        gap: 10px;
        justify-content: center;
        flex-wrap: wrap;
      }

      .sbzs-btn {
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        font-family: inherit;
        transition: background 0.15s ease, transform 0.1s ease;
      }

      .sbzs-btn:active {
        transform: scale(0.97);
      }

      .sbzs-btn-primary {
        background: #8b5cf6;
        color: #fff;
      }

      .sbzs-btn-primary:hover {
        background: #7c3aed;
      }

      .sbzs-btn-secondary {
        background: #1a1a1e;
        color: #f4f4f5;
        border: 1px solid rgba(255, 255, 255, 0.14);
      }

      .sbzs-btn-secondary:hover {
        background: #222228;
      }

      .sbzs-blur-layer {
        position: fixed;
        inset: 0;
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        background: rgba(12, 12, 14, 0.45);
        z-index: 999998;
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: sbzs-fade-in 0.4s ease;
      }

      .sbzs-feed-blurred {
        filter: blur(10px) !important;
        pointer-events: none !important;
        user-select: none !important;
      }
    `;

    document.head.appendChild(style);
  }

  function getRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function findFeedContainer() {
    return (
      document.querySelector('ytd-shorts') ||
      document.querySelector('#shorts-container') ||
      document.querySelector('ytd-reel-video-renderer')?.closest('#content') ||
      document.querySelector('#page-manager') ||
      document.querySelector('ytd-app')
    );
  }

  async function recordIntervention() {
    try {
      await sendMessage('INTERVENTION_SHOWN');
    } catch (err) {
      console.warn('[StudyBuddy] Intervention record failed:', err);
    }
  }

  async function openDashboard() {
    try {
      await sendMessage('LEARNING_MINUTES_RECOVERED', { minutes: 5 });
      await sendMessage('OPEN_DASHBOARD');
    } catch (err) {
      console.warn('[StudyBuddy] Open dashboard failed:', err);
    }
  }

  function dismissElement(el) {
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }

  function showToast(message, durationMs) {
    const root = getRoot();
    const toast = document.createElement('div');
    toast.className = 'sbzs-overlay sbzs-toast';
    toast.textContent = message;
    root.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => dismissElement(toast), durationMs);
  }

  function showCardOverlay(title, body, primaryLabel, onPrimary, secondaryLabel, onSecondary) {
    const root = getRoot();
    const overlay = document.createElement('div');
    overlay.className = 'sbzs-overlay sbzs-card-overlay';

    overlay.innerHTML = `
      <div class="sbzs-card">
        <p class="sbzs-card-title">${title}</p>
        <p class="sbzs-card-body">${body}</p>
        <div class="sbzs-card-actions">
          <button class="sbzs-btn sbzs-btn-secondary" data-action="continue">${secondaryLabel}</button>
          <button class="sbzs-btn sbzs-btn-primary" data-action="dashboard">${primaryLabel}</button>
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="continue"]').addEventListener('click', () => {
      dismissElement(overlay);
      if (onSecondary) onSecondary();
    });

    overlay.querySelector('[data-action="dashboard"]').addEventListener('click', () => {
      dismissElement(overlay);
      if (onPrimary) onPrimary();
    });

    root.appendChild(overlay);
    return overlay;
  }

  async function showGentleIntervention() {
    if (shownInterventions.has('gentle')) return;
    shownInterventions.add('gentle');
    await recordIntervention();
    showToast("Bro weren't you supposed to study? 📚", 5000);
  }

  async function showReflectIntervention() {
    if (shownInterventions.has('reflect')) return;
    shownInterventions.add('reflect');
    await recordIntervention();

    let notesCount = 0;
    try {
      notesCount = await sendMessage('GET_NOTES_TODAY_COUNT');
    } catch {
      notesCount = 0;
    }

    showCardOverlay(
      'Time for a check-in',
      `You watched several shorts.<br>Notes created today: <strong>${notesCount}</strong>`,
      'Open Study Dashboard',
      openDashboard,
      'Keep Watching',
      null
    );
  }

  async function showSwitchIntervention() {
    if (shownInterventions.has('switch')) return;
    shownInterventions.add('switch');
    await recordIntervention();

    showCardOverlay(
      'Want to switch gears?',
      'You\'ve been scrolling for a while. Ready to turn this into a study session?',
      'Open Study Dashboard',
      openDashboard,
      'Continue Scrolling',
      null
    );
  }

  function applyBlur() {
    if (blurActive) return;

    containerEl = findFeedContainer();
    if (containerEl) {
      containerEl.classList.add('sbzs-feed-blurred');
    }

    const root = getRoot();
    const blurLayer = document.createElement('div');
    blurLayer.className = 'sbzs-overlay sbzs-blur-layer';
    blurLayer.id = 'sbzs-blur-layer';

    blurLayer.innerHTML = `
      <div class="sbzs-card">
        <p class="sbzs-card-title">You've been scrolling for a while.</p>
        <p class="sbzs-card-body">Take a break from the feed and jump into your study dashboard.</p>
        <div class="sbzs-card-actions">
          <button class="sbzs-btn sbzs-btn-secondary" data-action="continue">Continue</button>
          <button class="sbzs-btn sbzs-btn-primary" data-action="dashboard">Open Dashboard</button>
        </div>
      </div>
    `;

    blurLayer.querySelector('[data-action="continue"]').addEventListener('click', () => {
      removeBlur();
    });

    blurLayer.querySelector('[data-action="dashboard"]').addEventListener('click', () => {
      removeBlur();
      openDashboard();
    });

    root.appendChild(blurLayer);
    blurActive = true;
  }

  function removeBlur() {
    const blurLayer = document.getElementById('sbzs-blur-layer');
    if (blurLayer) blurLayer.remove();

    if (containerEl) {
      containerEl.classList.remove('sbzs-feed-blurred');
      containerEl = null;
    }

    blurActive = false;
  }

  async function showBlurIntervention() {
    if (shownInterventions.has('blur')) return;
    shownInterventions.add('blur');
    await recordIntervention();
    applyBlur();
  }

  async function handleElapsed(seconds) {
    if (seconds >= THRESHOLDS.GENTLE && !shownInterventions.has('gentle')) {
      await showGentleIntervention();
    }

    if (seconds >= THRESHOLDS.REFLECT && !shownInterventions.has('reflect')) {
      await showReflectIntervention();
    }

    if (seconds >= THRESHOLDS.SWITCH) {
      if (blurModeEnabled && !shownInterventions.has('blur')) {
        await showBlurIntervention();
      } else if (!blurModeEnabled && !shownInterventions.has('switch')) {
        await showSwitchIntervention();
      }
    }
  }

  async function loadSettings() {
    try {
      const settings = await sendMessage('GET_SETTINGS');
      blurModeEnabled = settings.blurModeEnabled === true;
    } catch {
      blurModeEnabled = false;
    }
  }

  function reset() {
    shownInterventions.clear();
    removeBlur();
  }

  function destroy() {
    reset();
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  }

  async function init() {
    injectStyles();
    await loadSettings();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.settings) return;
      const newSettings = changes.settings.newValue || {};
      blurModeEnabled = newSettings.blurModeEnabled === true;
    });
  }

  return {
    init,
    handleElapsed,
    reset,
    destroy,
    loadSettings,
    THRESHOLDS
  };
})();
