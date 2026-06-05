/**
 * StudyBuddy + ZeroScroll — Storage Layer
 * Reusable helpers for chrome.storage.local persistence.
 * Works in service worker (importScripts), content scripts, and extension pages.
 */

const StudyBuddyStorage = (function () {
  'use strict';

  const KEYS = {
    NOTES: 'notes',
    FLASHCARDS: 'flashcards',
    FOCUS_SESSIONS: 'focusSessions',
    ACTIVE_FOCUS: 'activeFocusSession',
    STATS: 'stats',
    SETTINGS: 'settings',
    SHORTS_SESSIONS: 'shortsSessions'
  };

  const DEFAULT_STATS = {
    dailyFocusTime: {},
    weeklyFocusTime: {},
    totalFocusTime: 0,
    notesCount: 0,
    flashcardsCount: 0,
    shortsWatched: 0,
    shortsSessions: 0,
    shortsTimeSpent: 0,
    distractionInterventions: 0,
    learningMinutesRecovered: 0,
    activityDays: [],
    currentStreak: 0,
    longestStreak: 0
  };

  const DEFAULT_SETTINGS = {
    blurModeEnabled: false
  };

  function generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  function getDateKey(timestamp) {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function getWeekKey(timestamp) {
    const d = new Date(timestamp);
    const year = d.getFullYear();
    const startOfYear = new Date(year, 0, 1);
    const dayOfYear = Math.floor((d - startOfYear) / 86400000) + 1;
    const week = Math.ceil((dayOfYear + startOfYear.getDay()) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  function getLocal(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => {
        resolve(result);
      });
    });
  }

  function setLocal(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, () => {
        resolve();
      });
    });
  }

  async function ensureInitialized() {
    const result = await getLocal([KEYS.STATS, KEYS.SETTINGS, KEYS.NOTES, KEYS.FLASHCARDS]);
    const updates = {};

    if (!result[KEYS.STATS]) {
      updates[KEYS.STATS] = { ...DEFAULT_STATS };
    }
    if (!result[KEYS.SETTINGS]) {
      updates[KEYS.SETTINGS] = { ...DEFAULT_SETTINGS };
    }
    if (!result[KEYS.NOTES]) {
      updates[KEYS.NOTES] = [];
    }
    if (!result[KEYS.FLASHCARDS]) {
      updates[KEYS.FLASHCARDS] = [];
    }

    if (Object.keys(updates).length > 0) {
      await setLocal(updates);
    }
  }

  function calculateStreak(activityDays) {
    if (!activityDays || activityDays.length === 0) {
      return { currentStreak: 0, longestStreak: 0 };
    }

    const sorted = [...new Set(activityDays)].sort();
    const today = getDateKey(Date.now());
    const yesterday = getDateKey(Date.now() - 86400000);

    let currentStreak = 0;
    let longestStreak = 0;
    let streak = 0;

    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        streak = 1;
      } else {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        const diffDays = Math.round((curr - prev) / 86400000);
        streak = diffDays === 1 ? streak + 1 : 1;
      }
      longestStreak = Math.max(longestStreak, streak);
    }

    const lastDay = sorted[sorted.length - 1];
    if (lastDay === today || lastDay === yesterday) {
      currentStreak = 1;
      for (let i = sorted.length - 2; i >= 0; i--) {
        const prev = new Date(sorted[i]);
        const next = new Date(sorted[i + 1]);
        const diffDays = Math.round((next - prev) / 86400000);
        if (diffDays === 1) {
          currentStreak++;
        } else {
          break;
        }
      }
    }

    return { currentStreak, longestStreak };
  }

  async function registerActivityDay(timestamp) {
    const dateKey = getDateKey(timestamp);
    const result = await getLocal([KEYS.STATS]);
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };
    const activityDays = stats.activityDays || [];

    if (!activityDays.includes(dateKey)) {
      activityDays.push(dateKey);
      activityDays.sort();
    }

    const { currentStreak, longestStreak } = calculateStreak(activityDays);
    stats.activityDays = activityDays;
    stats.currentStreak = currentStreak;
    stats.longestStreak = Math.max(stats.longestStreak || 0, longestStreak);

    await setLocal({ [KEYS.STATS]: stats });
    return stats;
  }

  async function checkAndRegisterFocusActivity(timestamp, focusSeconds) {
    if (focusSeconds >= 900) {
      await registerActivityDay(timestamp);
    }
  }

  async function saveNote(noteData) {
    await ensureInitialized();

    const note = {
      id: generateId(),
      text: noteData.text || '',
      pageTitle: noteData.pageTitle || 'Untitled',
      pageUrl: noteData.pageUrl || '',
      timestamp: noteData.timestamp || Date.now()
    };

    const result = await getLocal([KEYS.NOTES, KEYS.STATS]);
    const notes = result[KEYS.NOTES] || [];
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };

    notes.unshift(note);
    stats.notesCount = notes.length;

    await setLocal({
      [KEYS.NOTES]: notes,
      [KEYS.STATS]: stats
    });

    await registerActivityDay(note.timestamp);
    return note;
  }

  async function deleteNote(noteId) {
    const result = await getLocal([KEYS.NOTES, KEYS.STATS]);
    const notes = (result[KEYS.NOTES] || []).filter((n) => n.id !== noteId);
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };

    stats.notesCount = notes.length;

    await setLocal({
      [KEYS.NOTES]: notes,
      [KEYS.STATS]: stats
    });

    return true;
  }

  async function getNotes() {
    await ensureInitialized();
    const result = await getLocal([KEYS.NOTES]);
    return (result[KEYS.NOTES] || []).sort((a, b) => b.timestamp - a.timestamp);
  }

  async function getNotesCountToday() {
    const notes = await getNotes();
    const today = getDateKey(Date.now());
    return notes.filter((n) => getDateKey(n.timestamp) === today).length;
  }

  function extractKeyword(text) {
    const cleaned = text.trim().replace(/[^\w\s-]/g, '');
    const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) {
      return cleaned.slice(0, 30) || 'this concept';
    }
    if (words.length <= 3) {
      return words.join(' ');
    }
    return words.slice(0, 3).join(' ');
  }

  async function saveFlashcard(cardData) {
    await ensureInitialized();

    const keyword = cardData.keyword || extractKeyword(cardData.answer || '');
    const flashcard = {
      id: generateId(),
      question: cardData.question || `What is ${keyword}?`,
      answer: cardData.answer || '',
      pageUrl: cardData.pageUrl || '',
      timestamp: cardData.timestamp || Date.now()
    };

    const result = await getLocal([KEYS.FLASHCARDS, KEYS.STATS]);
    const flashcards = result[KEYS.FLASHCARDS] || [];
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };

    flashcards.unshift(flashcard);
    stats.flashcardsCount = flashcards.length;

    await setLocal({
      [KEYS.FLASHCARDS]: flashcards,
      [KEYS.STATS]: stats
    });

    await registerActivityDay(flashcard.timestamp);
    return flashcard;
  }

  async function deleteFlashcard(cardId) {
    const result = await getLocal([KEYS.FLASHCARDS, KEYS.STATS]);
    const flashcards = (result[KEYS.FLASHCARDS] || []).filter((c) => c.id !== cardId);
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };

    stats.flashcardsCount = flashcards.length;

    await setLocal({
      [KEYS.FLASHCARDS]: flashcards,
      [KEYS.STATS]: stats
    });

    return true;
  }

  async function getFlashcards() {
    await ensureInitialized();
    const result = await getLocal([KEYS.FLASHCARDS]);
    return (result[KEYS.FLASHCARDS] || []).sort((a, b) => b.timestamp - a.timestamp);
  }

  async function saveFocusSession(sessionData) {
    await ensureInitialized();

    const session = {
      id: sessionData.id || generateId(),
      startTime: sessionData.startTime,
      endTime: sessionData.endTime || Date.now(),
      duration: sessionData.duration || 0,
      status: sessionData.status || 'completed'
    };

    const result = await getLocal([KEYS.FOCUS_SESSIONS, KEYS.STATS]);
    const sessions = result[KEYS.FOCUS_SESSIONS] || [];
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };

    sessions.push(session);

    const dateKey = getDateKey(session.endTime);
    const weekKey = getWeekKey(session.endTime);

    stats.dailyFocusTime[dateKey] = (stats.dailyFocusTime[dateKey] || 0) + session.duration;
    stats.weeklyFocusTime[weekKey] = (stats.weeklyFocusTime[weekKey] || 0) + session.duration;
    stats.totalFocusTime = (stats.totalFocusTime || 0) + session.duration;

    await setLocal({
      [KEYS.FOCUS_SESSIONS]: sessions,
      [KEYS.STATS]: stats,
      [KEYS.ACTIVE_FOCUS]: null
    });

    await checkAndRegisterFocusActivity(session.endTime, stats.dailyFocusTime[dateKey]);
    return session;
  }

  async function startFocusSession() {
    await ensureInitialized();

    const result = await getLocal([KEYS.ACTIVE_FOCUS]);
    if (result[KEYS.ACTIVE_FOCUS] && result[KEYS.ACTIVE_FOCUS].status === 'active') {
      return result[KEYS.ACTIVE_FOCUS];
    }

    const session = {
      id: generateId(),
      startTime: Date.now(),
      pausedAt: null,
      totalPausedDuration: 0,
      status: 'active'
    };

    await setLocal({ [KEYS.ACTIVE_FOCUS]: session });
    return session;
  }

  async function pauseFocusSession() {
    const result = await getLocal([KEYS.ACTIVE_FOCUS]);
    const active = result[KEYS.ACTIVE_FOCUS];

    if (!active || active.status !== 'active') {
      return null;
    }

    active.status = 'paused';
    active.pausedAt = Date.now();
    await setLocal({ [KEYS.ACTIVE_FOCUS]: active });
    return active;
  }

  async function resumeFocusSession() {
    const result = await getLocal([KEYS.ACTIVE_FOCUS]);
    const active = result[KEYS.ACTIVE_FOCUS];

    if (!active || active.status !== 'paused') {
      return null;
    }

    if (active.pausedAt) {
      active.totalPausedDuration += Date.now() - active.pausedAt;
    }
    active.pausedAt = null;
    active.status = 'active';
    await setLocal({ [KEYS.ACTIVE_FOCUS]: active });
    return active;
  }

  async function stopFocusSession() {
    const result = await getLocal([KEYS.ACTIVE_FOCUS]);
    const active = result[KEYS.ACTIVE_FOCUS];

    if (!active) {
      return null;
    }

    let endTime = Date.now();
    let totalPaused = active.totalPausedDuration || 0;

    if (active.status === 'paused' && active.pausedAt) {
      totalPaused += endTime - active.pausedAt;
    }

    const duration = Math.max(0, Math.floor((endTime - active.startTime - totalPaused) / 1000));

    if (duration > 0) {
      return await saveFocusSession({
        id: active.id,
        startTime: active.startTime,
        endTime,
        duration,
        status: 'completed'
      });
    }

    await setLocal({ [KEYS.ACTIVE_FOCUS]: null });
    return { id: active.id, duration: 0, status: 'cancelled' };
  }

  async function getActiveFocusSession() {
    const result = await getLocal([KEYS.ACTIVE_FOCUS]);
    return result[KEYS.ACTIVE_FOCUS] || null;
  }

  function getElapsedFocusSeconds(active) {
    if (!active) return 0;

    const now = Date.now();
    let paused = active.totalPausedDuration || 0;

    if (active.status === 'paused' && active.pausedAt) {
      paused += now - active.pausedAt;
    }

    return Math.max(0, Math.floor((now - active.startTime - paused) / 1000));
  }

  async function updateStats(updates) {
    await ensureInitialized();

    const result = await getLocal([KEYS.STATS]);
    const stats = { ...(result[KEYS.STATS] || DEFAULT_STATS), ...updates };

    if (updates.activityDays) {
      const streak = calculateStreak(updates.activityDays);
      stats.currentStreak = streak.currentStreak;
      stats.longestStreak = Math.max(stats.longestStreak || 0, streak.longestStreak);
    }

    await setLocal({ [KEYS.STATS]: stats });
    return stats;
  }

  async function incrementStat(statKey, amount) {
    const result = await getLocal([KEYS.STATS]);
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };
    stats[statKey] = (stats[statKey] || 0) + (amount || 1);
    await setLocal({ [KEYS.STATS]: stats });
    return stats;
  }

  async function recordShortsSessionStart() {
    const session = {
      id: generateId(),
      startTime: Date.now(),
      endTime: null,
      shortsWatched: 0,
      timeSpent: 0
    };

    const result = await getLocal([KEYS.SHORTS_SESSIONS, KEYS.STATS]);
    const sessions = result[KEYS.SHORTS_SESSIONS] || [];
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };

    sessions.push(session);
    stats.shortsSessions = (stats.shortsSessions || 0) + 1;

    await setLocal({
      [KEYS.SHORTS_SESSIONS]: sessions,
      [KEYS.STATS]: stats
    });

    return session;
  }

  async function updateShortsTime(seconds) {
    const result = await getLocal([KEYS.SHORTS_SESSIONS, KEYS.STATS]);
    const sessions = result[KEYS.SHORTS_SESSIONS] || [];
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };

    if (sessions.length > 0) {
      const current = sessions[sessions.length - 1];
      current.timeSpent = seconds;
      if (!current.endTime) {
        current.endTime = Date.now();
      }
    }

    stats.shortsTimeSpent = seconds;

    await setLocal({
      [KEYS.SHORTS_SESSIONS]: sessions,
      [KEYS.STATS]: stats
    });

    return stats;
  }

  async function incrementShortsWatched() {
    const result = await getLocal([KEYS.SHORTS_SESSIONS, KEYS.STATS]);
    const sessions = result[KEYS.SHORTS_SESSIONS] || [];
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };

    if (sessions.length > 0) {
      sessions[sessions.length - 1].shortsWatched =
        (sessions[sessions.length - 1].shortsWatched || 0) + 1;
    }

    stats.shortsWatched = (stats.shortsWatched || 0) + 1;

    await setLocal({
      [KEYS.SHORTS_SESSIONS]: sessions,
      [KEYS.STATS]: stats
    });

    return stats;
  }

  async function recordIntervention() {
    return await incrementStat('distractionInterventions', 1);
  }

  async function recordLearningMinutesRecovered(minutes) {
    const result = await getLocal([KEYS.STATS]);
    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };
    stats.learningMinutesRecovered = (stats.learningMinutesRecovered || 0) + minutes;
    await setLocal({ [KEYS.STATS]: stats });
    return stats;
  }

  async function getSettings() {
    await ensureInitialized();
    const result = await getLocal([KEYS.SETTINGS]);
    return { ...DEFAULT_SETTINGS, ...(result[KEYS.SETTINGS] || {}) };
  }

  async function updateSettings(settings) {
    const current = await getSettings();
    const merged = { ...current, ...settings };
    await setLocal({ [KEYS.SETTINGS]: merged });
    return merged;
  }

  function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  }

  function getStreakEmoji(streak) {
    if (streak >= 7) return '🔥🔥🔥';
    if (streak >= 3) return '🔥🔥';
    if (streak >= 1) return '🔥';
    return '';
  }

  async function getDashboardData() {
    await ensureInitialized();

    const result = await getLocal([
      KEYS.STATS,
      KEYS.NOTES,
      KEYS.FLASHCARDS,
      KEYS.ACTIVE_FOCUS,
      KEYS.SETTINGS
    ]);

    const stats = result[KEYS.STATS] || { ...DEFAULT_STATS };
    const notes = result[KEYS.NOTES] || [];
    const flashcards = result[KEYS.FLASHCARDS] || [];
    const activeFocus = result[KEYS.ACTIVE_FOCUS] || null;
    const settings = { ...DEFAULT_SETTINGS, ...(result[KEYS.SETTINGS] || {}) };

    const today = getDateKey(Date.now());
    const weekKey = getWeekKey(Date.now());

    const todayFocusSeconds = stats.dailyFocusTime[today] || 0;
    const weeklyFocusSeconds = stats.weeklyFocusTime[weekKey] || 0;

    const notesToday = notes.filter((n) => getDateKey(n.timestamp) === today).length;
    const flashcardsToday = flashcards.filter((c) => getDateKey(c.timestamp) === today).length;

    const streak = stats.currentStreak || 0;

    return {
      todayFocusTime: todayFocusSeconds,
      todayFocusFormatted: formatDuration(todayFocusSeconds),
      weeklyFocusTime: weeklyFocusSeconds,
      weeklyFocusFormatted: formatDuration(weeklyFocusSeconds),
      totalFocusTime: stats.totalFocusTime || 0,
      totalFocusFormatted: formatDuration(stats.totalFocusTime || 0),
      studyStreak: streak,
      streakEmoji: getStreakEmoji(streak),
      notesSaved: stats.notesCount || notes.length,
      notesToday,
      flashcardsCreated: stats.flashcardsCount || flashcards.length,
      flashcardsToday,
      shortsWatched: stats.shortsWatched || 0,
      shortsSessions: stats.shortsSessions || 0,
      shortsTimeSpent: stats.shortsTimeSpent || 0,
      shortsTimeFormatted: formatDuration(stats.shortsTimeSpent || 0),
      distractionInterventions: stats.distractionInterventions || 0,
      learningMinutesRecovered: stats.learningMinutesRecovered || 0,
      activeFocusSession: activeFocus,
      activeFocusElapsed: getElapsedFocusSeconds(activeFocus),
      blurModeEnabled: settings.blurModeEnabled,
      settings
    };
  }

  return {
    KEYS,
    generateId,
    getDateKey,
    getWeekKey,
    ensureInitialized,
    saveNote,
    deleteNote,
    getNotes,
    getNotesCountToday,
    saveFlashcard,
    deleteFlashcard,
    getFlashcards,
    extractKeyword,
    saveFocusSession,
    startFocusSession,
    pauseFocusSession,
    resumeFocusSession,
    stopFocusSession,
    getActiveFocusSession,
    getElapsedFocusSeconds,
    updateStats,
    incrementStat,
    recordShortsSessionStart,
    updateShortsTime,
    incrementShortsWatched,
    recordIntervention,
    recordLearningMinutesRecovered,
    getSettings,
    updateSettings,
    getDashboardData,
    formatDuration,
    getStreakEmoji,
    registerActivityDay
  };
})();
