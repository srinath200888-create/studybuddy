/**
 * StudyBuddy + ZeroScroll — Shorts Tracker
 * Tracks time spent on YouTube Shorts and shorts watched count.
 */

const ShortsTracker = (function () {
  'use strict';

  const TICK_INTERVAL_MS = 1000;
  const SYNC_INTERVAL_MS = 5000;

  let elapsedSeconds = 0;
  let isActive = false;
  let tickTimer = null;
  let syncTimer = null;
  let currentVideoId = null;
  let sessionStarted = false;
  let onTickCallback = null;

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

  function extractVideoId(url) {
    try {
      const parsed = new URL(url);
      const match = parsed.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  function isDocumentVisible() {
    return document.visibilityState === 'visible';
  }

  async function ensureSession() {
    if (!sessionStarted) {
      await sendMessage('SHORTS_SESSION_START');
      sessionStarted = true;
    }
  }

  async function syncTime() {
    try {
      await sendMessage('SHORTS_TIME_UPDATE', { seconds: elapsedSeconds });
    } catch (err) {
      console.warn('[StudyBuddy] Shorts time sync failed:', err);
    }
  }

  function tick() {
    if (!isActive || !isDocumentVisible()) return;

    elapsedSeconds += 1;

    if (onTickCallback) {
      onTickCallback(elapsedSeconds);
    }
  }

  function startTimers() {
    stopTimers();
    tickTimer = setInterval(tick, TICK_INTERVAL_MS);
    syncTimer = setInterval(syncTime, SYNC_INTERVAL_MS);
  }

  function stopTimers() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    if (syncTimer) {
      clearInterval(syncTimer);
      syncTimer = null;
    }
  }

  async function handleVideoChange(url) {
    const videoId = extractVideoId(url);
    if (!videoId || videoId === currentVideoId) return;

    currentVideoId = videoId;

    try {
      await sendMessage('SHORTS_WATCHED');
    } catch (err) {
      console.warn('[StudyBuddy] Shorts watched sync failed:', err);
    }
  }

  async function start(url) {
    if (isActive) {
      await handleVideoChange(url);
      return;
    }

    isActive = true;
    elapsedSeconds = 0;
    currentVideoId = null;
    sessionStarted = false;

    await ensureSession();
    await handleVideoChange(url);
    startTimers();
    await syncTime();
  }

  async function pause() {
    if (!isActive) return;
    await syncTime();
  }

  async function resume(url) {
    if (!isActive) {
      await start(url);
      return;
    }
    await handleVideoChange(url);
  }

  async function stop() {
    if (!isActive) return;

    isActive = false;
    stopTimers();
    await syncTime();

    elapsedSeconds = 0;
    currentVideoId = null;
    sessionStarted = false;
    onTickCallback = null;
  }

  function getElapsedSeconds() {
    return elapsedSeconds;
  }

  function isRunning() {
    return isActive;
  }

  function onTick(callback) {
    onTickCallback = callback;
  }

  function handleVisibilityChange() {
    if (!isActive) return;

    if (isDocumentVisible()) {
      syncTime().catch(() => {});
    } else {
      syncTime().catch(() => {});
    }
  }

  return {
    extractVideoId,
    start,
    pause,
    resume,
    stop,
    getElapsedSeconds,
    isRunning,
    onTick,
    handleVideoChange,
    handleVisibilityChange
  };
})();
