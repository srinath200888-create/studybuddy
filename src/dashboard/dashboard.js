/**
 * StudyBuddy + ZeroScroll — Dashboard Controller
 */

(function () {
  'use strict';

  const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

  const els = {
    streakValue: document.getElementById('streakValue'),
    streakUnit: document.getElementById('streakUnit'),
    streakEmoji: document.getElementById('streakEmoji'),
    streakMessage: document.getElementById('streakMessage'),
    streakRing: document.getElementById('streakRing'),
    focusToday: document.getElementById('focusToday'),
    focusWeekly: document.getElementById('focusWeekly'),
    focusTotal: document.getElementById('focusTotal'),
    notesCount: document.getElementById('notesCount'),
    notesTodayBadge: document.getElementById('notesTodayBadge'),
    flashcardsCount: document.getElementById('flashcardsCount'),
    cardsTodayBadge: document.getElementById('cardsTodayBadge'),
    learningRecovered: document.getElementById('learningRecovered'),
    sessionDot: document.getElementById('sessionDot'),
    sessionText: document.getElementById('sessionText'),
    sessionTime: document.getElementById('sessionTime'),
    lastUpdated: document.getElementById('lastUpdated')
  };

  let refreshInterval = null;
  let sessionTickInterval = null;

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

  function formatTimerDisplay(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function getStreakMessage(streak) {
    if (streak >= 7) {
      return 'Incredible consistency — you\'re on fire!';
    }
    if (streak >= 3) {
      return 'Great momentum — keep the streak alive!';
    }
    if (streak >= 1) {
      return 'You\'re building a habit. Come back tomorrow!';
    }
    return 'Create a note, flashcard, or study 15 min to start';
  }

  function updateStreakRing(streak) {
    const target = 7;
    const progress = Math.min(streak / target, 1);
    const offset = RING_CIRCUMFERENCE * (1 - progress);
    els.streakRing.style.strokeDashoffset = String(offset);
  }

  function renderStreak(data) {
    const streak = data.studyStreak || 0;
    const dayLabel = streak === 1 ? 'Day' : 'Days';

    els.streakValue.textContent = String(streak);
    els.streakUnit.textContent = dayLabel;
    els.streakEmoji.textContent = data.streakEmoji || '';
    els.streakMessage.textContent = getStreakMessage(streak);
    updateStreakRing(streak);
  }

  function renderFocus(data) {
    els.focusToday.textContent = data.todayFocusFormatted || '0s';
    els.focusWeekly.textContent = data.weeklyFocusFormatted || '0s';
    els.focusTotal.textContent = data.totalFocusFormatted || '0s';
  }

  function renderCounts(data) {
    els.notesCount.textContent = String(data.notesSaved || 0);
    els.flashcardsCount.textContent = String(data.flashcardsCreated || 0);

    const notesToday = data.notesToday || 0;
    const cardsToday = data.flashcardsToday || 0;

    els.notesTodayBadge.textContent = `+${notesToday} today`;
    els.cardsTodayBadge.textContent = `+${cardsToday} today`;

    els.notesTodayBadge.style.display = notesToday > 0 ? 'inline' : 'none';
    els.cardsTodayBadge.style.display = cardsToday > 0 ? 'inline' : 'none';
  }

  function renderLearningRecovered(data) {
    const minutes = data.learningMinutesRecovered || 0;
    els.learningRecovered.textContent = String(minutes);
  }

  function renderSession(data) {
    const session = data.activeFocusSession;
    els.sessionDot.classList.remove('active', 'paused');

    if (!session) {
      els.sessionText.textContent = 'No active focus session';
      els.sessionTime.textContent = '';
      stopSessionTick();
      return;
    }

    const elapsed = data.activeFocusElapsed || 0;

    if (session.status === 'active') {
      els.sessionDot.classList.add('active');
      els.sessionText.textContent = 'Focus session in progress';
      startSessionTick();
    } else if (session.status === 'paused') {
      els.sessionDot.classList.add('paused');
      els.sessionText.textContent = 'Focus session paused';
      stopSessionTick();
    }

    els.sessionTime.textContent = formatTimerDisplay(elapsed);
  }

  function updateLastRefreshed() {
    const now = new Date();
    els.lastUpdated.textContent = now.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderDashboard(data) {
    renderStreak(data);
    renderFocus(data);
    renderCounts(data);
    renderLearningRecovered(data);
    renderSession(data);
    updateLastRefreshed();
  }

  async function loadDashboard() {
    const data = await sendMessage('GET_DASHBOARD_DATA');
    renderDashboard(data);
    return data;
  }

  function startSessionTick() {
    stopSessionTick();
    sessionTickInterval = setInterval(async () => {
      try {
        const state = await sendMessage('GET_FOCUS_STATE');
        if (state.session) {
          els.sessionTime.textContent = formatTimerDisplay(state.elapsed);
        } else {
          stopSessionTick();
          await loadDashboard();
        }
      } catch {
        stopSessionTick();
      }
    }, 1000);
  }

  function stopSessionTick() {
    if (sessionTickInterval) {
      clearInterval(sessionTickInterval);
      sessionTickInterval = null;
    }
  }

  function startAutoRefresh() {
    refreshInterval = setInterval(() => {
      loadDashboard().catch(() => {});
    }, 30000);
  }

  function bindEvents() {
    chrome.runtime.onMessage.addListener((message) => {
      if (
        message.type === 'STORAGE_CHANGED' ||
        message.type === 'DATA_UPDATED' ||
        message.type === 'FOCUS_TICK'
      ) {
        loadDashboard().catch(() => {});
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        loadDashboard().catch(() => {});
      }
    });
  }

  async function init() {
    bindEvents();
    try {
      await loadDashboard();
      startAutoRefresh();
    } catch (err) {
      console.error('[StudyBuddy Dashboard] Init failed:', err);
      els.streakMessage.textContent = 'Unable to load dashboard data. Try reloading.';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('beforeunload', () => {
    stopSessionTick();
    if (refreshInterval) clearInterval(refreshInterval);
  });
})();
