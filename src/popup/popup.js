/**
 * StudyBuddy + ZeroScroll — Popup Controller
 */

(function () {
  'use strict';

  const URLS = {
    dashboard: chrome.runtime.getURL('src/dashboard/dashboard.html'),
    notes: chrome.runtime.getURL('src/notes/notes.html'),
    flashcards: chrome.runtime.getURL('src/flashcards/flashcards.html')
  };

  const els = {
    timerDisplay: document.getElementById('timerDisplay'),
    timerStatus: document.getElementById('timerStatus'),
    btnStart: document.getElementById('btnStart'),
    btnPause: document.getElementById('btnPause'),
    btnResume: document.getElementById('btnResume'),
    btnStop: document.getElementById('btnStop'),
    streakCount: document.getElementById('streakCount'),
    streakEmoji: document.getElementById('streakEmoji'),
    statFocusToday: document.getElementById('statFocusToday'),
    statNotesToday: document.getElementById('statNotesToday'),
    statCardsToday: document.getElementById('statCardsToday'),
    statWeeklyFocus: document.getElementById('statWeeklyFocus'),
    notesTotalLabel: document.getElementById('notesTotalLabel'),
    cardsTotalLabel: document.getElementById('cardsTotalLabel'),
    btnDashboard: document.getElementById('btnDashboard'),
    btnNotes: document.getElementById('btnNotes'),
    btnFlashcards: document.getElementById('btnFlashcards')
  };

  let tickInterval = null;
  let sessionElapsed = 0;
  let sessionStatus = null;

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

  function formatShortDuration(seconds) {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
  }

  function openPage(url) {
    chrome.tabs.create({ url });
    window.close();
  }

  function setTimerUI(elapsed, status) {
    sessionElapsed = elapsed;
    sessionStatus = status;

    els.timerDisplay.textContent = formatTimerDisplay(elapsed);
    els.timerDisplay.classList.remove('active', 'paused');

    els.btnStart.classList.add('hidden');
    els.btnPause.classList.add('hidden');
    els.btnResume.classList.add('hidden');
    els.btnStop.classList.add('hidden');

    if (!status) {
      els.timerDisplay.textContent = formatTimerDisplay(0);
      els.timerStatus.textContent = 'Ready to focus';
      els.btnStart.classList.remove('hidden');
      stopLocalTick();
      return;
    }

    if (status === 'active') {
      els.timerDisplay.classList.add('active');
      els.timerStatus.textContent = 'Session in progress';
      els.btnPause.classList.remove('hidden');
      els.btnStop.classList.remove('hidden');
      startLocalTick();
      return;
    }

    if (status === 'paused') {
      els.timerDisplay.classList.add('paused');
      els.timerStatus.textContent = 'Session paused';
      els.btnResume.classList.remove('hidden');
      els.btnStop.classList.remove('hidden');
      stopLocalTick();
    }
  }

  function startLocalTick() {
    stopLocalTick();
    tickInterval = setInterval(async () => {
      try {
        const state = await sendMessage('GET_FOCUS_STATE');
        if (state.session && state.session.status === 'active') {
          setTimerUI(state.elapsed, 'active');
        } else {
          stopLocalTick();
        }
      } catch {
        stopLocalTick();
      }
    }, 1000);
  }

  function stopLocalTick() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  function renderStats(data) {
    els.streakCount.textContent = data.studyStreak || 0;
    els.streakEmoji.textContent = data.streakEmoji || '';

    els.statFocusToday.textContent = data.todayFocusFormatted || formatShortDuration(0);
    els.statNotesToday.textContent = String(data.notesToday || 0);
    els.statCardsToday.textContent = String(data.flashcardsToday || 0);
    els.statWeeklyFocus.textContent = data.weeklyFocusFormatted || formatShortDuration(0);

    const notesTotal = data.notesSaved || 0;
    const cardsTotal = data.flashcardsCreated || 0;

    els.notesTotalLabel.textContent = `${notesTotal} saved`;
    els.cardsTotalLabel.textContent = `${cardsTotal} created`;
  }

  async function loadDashboard() {
    const data = await sendMessage('GET_DASHBOARD_DATA');
    renderStats(data);

    const active = data.activeFocusSession;
    if (active) {
      setTimerUI(data.activeFocusElapsed || 0, active.status);
    } else {
      setTimerUI(0, null);
    }

    return data;
  }

  async function handleStart() {
    els.btnStart.disabled = true;
    try {
      const session = await sendMessage('START_FOCUS');
      setTimerUI(0, session.status);
    } catch (err) {
      console.error('[StudyBuddy Popup] Start failed:', err);
    } finally {
      els.btnStart.disabled = false;
    }
  }

  async function handlePause() {
    els.btnPause.disabled = true;
    try {
      const session = await sendMessage('PAUSE_FOCUS');
      if (session) {
        const state = await sendMessage('GET_FOCUS_STATE');
        setTimerUI(state.elapsed, 'paused');
      }
    } catch (err) {
      console.error('[StudyBuddy Popup] Pause failed:', err);
    } finally {
      els.btnPause.disabled = false;
    }
  }

  async function handleResume() {
    els.btnResume.disabled = true;
    try {
      const session = await sendMessage('RESUME_FOCUS');
      if (session) {
        const state = await sendMessage('GET_FOCUS_STATE');
        setTimerUI(state.elapsed, 'active');
      }
    } catch (err) {
      console.error('[StudyBuddy Popup] Resume failed:', err);
    } finally {
      els.btnResume.disabled = false;
    }
  }

  async function handleStop() {
    els.btnStop.disabled = true;
    try {
      await sendMessage('STOP_FOCUS');
      setTimerUI(0, null);
      await loadDashboard();
    } catch (err) {
      console.error('[StudyBuddy Popup] Stop failed:', err);
    } finally {
      els.btnStop.disabled = false;
    }
  }

  function bindEvents() {
    els.btnStart.addEventListener('click', handleStart);
    els.btnPause.addEventListener('click', handlePause);
    els.btnResume.addEventListener('click', handleResume);
    els.btnStop.addEventListener('click', handleStop);

    els.btnDashboard.addEventListener('click', () => {
      sendMessage('OPEN_DASHBOARD').catch(() => {
        openPage(URLS.dashboard);
      });
    });

    els.btnNotes.addEventListener('click', () => openPage(URLS.notes));
    els.btnFlashcards.addEventListener('click', () => openPage(URLS.flashcards));

    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'FOCUS_TICK') {
        if (sessionStatus === 'active') {
          setTimerUI(message.elapsed, 'active');
        }
      }

      if (message.type === 'STORAGE_CHANGED' || message.type === 'DATA_UPDATED') {
        loadDashboard().catch(() => {});
      }
    });
  }

  async function init() {
    bindEvents();
    try {
      await loadDashboard();
    } catch (err) {
      console.error('[StudyBuddy Popup] Init failed:', err);
      els.timerStatus.textContent = 'Unable to load data';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('unload', stopLocalTick);
})();
