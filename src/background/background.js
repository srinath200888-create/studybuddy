/**
 * StudyBuddy + ZeroScroll — Background Service Worker
 * Handles context menus, storage, statistics, and cross-page messaging.
 */

importScripts('../utils/storage.js');

const DASHBOARD_URL = chrome.runtime.getURL('src/dashboard/dashboard.html');
const FOCUS_ALARM_NAME = 'studybuddy-focus-tick';

chrome.runtime.onInstalled.addListener(async (details) => {
  await StudyBuddyStorage.ensureInitialized();
  setupContextMenus();

  if (details.reason === 'install') {
    chrome.storage.local.set({
      installedAt: Date.now(),
      version: chrome.runtime.getManifest().version
    });
  }
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'add-to-study-notes',
      title: 'Add To Study Notes',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'create-flashcard',
      title: 'Create Flashcard',
      contexts: ['selection']
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;

  const selectedText = (info.selectionText || '').trim();
  if (!selectedText) return;

  const pageTitle = tab.title || 'Untitled';
  const pageUrl = tab.url || '';

  try {
    if (info.menuItemId === 'add-to-study-notes') {
      const note = await StudyBuddyStorage.saveNote({
        text: selectedText,
        pageTitle,
        pageUrl,
        timestamp: Date.now()
      });

      notifyTab(tab.id, {
        type: 'NOTIFICATION',
        message: 'Note saved to StudyBuddy!',
        variant: 'success'
      });

      chrome.runtime.sendMessage({
        type: 'DATA_UPDATED',
        entity: 'note',
        data: note
      }).catch(() => {});
    }

    if (info.menuItemId === 'create-flashcard') {
      const keyword = StudyBuddyStorage.extractKeyword(selectedText);
      const flashcard = await StudyBuddyStorage.saveFlashcard({
        question: `What is ${keyword}?`,
        answer: selectedText,
        pageUrl,
        timestamp: Date.now()
      });

      notifyTab(tab.id, {
        type: 'NOTIFICATION',
        message: 'Flashcard created!',
        variant: 'success'
      });

      chrome.runtime.sendMessage({
        type: 'DATA_UPDATED',
        entity: 'flashcard',
        data: flashcard
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[StudyBuddy] Context menu action failed:', err);
  }
});

function notifyTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message).catch(() => {});
}

function openDashboard() {
  chrome.tabs.create({ url: DASHBOARD_URL });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== FOCUS_ALARM_NAME) return;

  const active = await StudyBuddyStorage.getActiveFocusSession();
  if (!active || active.status !== 'active') {
    chrome.alarms.clear(FOCUS_ALARM_NAME);
    return;
  }

  chrome.runtime.sendMessage({
    type: 'FOCUS_TICK',
    elapsed: StudyBuddyStorage.getElapsedFocusSeconds(active)
  }).catch(() => {});
});

async function startFocusAlarm() {
  chrome.alarms.create(FOCUS_ALARM_NAME, { periodInMinutes: 1 });
}

async function stopFocusAlarm() {
  chrome.alarms.clear(FOCUS_ALARM_NAME);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ success: true, data: result }))
    .catch((err) => {
      console.error('[StudyBuddy] Message handler error:', err);
      sendResponse({ success: false, error: err.message });
    });

  return true;
});

async function handleMessage(message, sender) {
  const { type, payload } = message;

  switch (type) {
    case 'GET_DASHBOARD_DATA':
      return await StudyBuddyStorage.getDashboardData();

    case 'GET_SETTINGS':
      return await StudyBuddyStorage.getSettings();

    case 'UPDATE_SETTINGS':
      return await StudyBuddyStorage.updateSettings(payload);

    case 'SAVE_NOTE':
      return await StudyBuddyStorage.saveNote(payload);

    case 'DELETE_NOTE':
      await StudyBuddyStorage.deleteNote(payload.id);
      return { deleted: true };

    case 'GET_NOTES':
      return await StudyBuddyStorage.getNotes();

    case 'GET_NOTES_TODAY_COUNT':
      return await StudyBuddyStorage.getNotesCountToday();

    case 'SAVE_FLASHCARD':
      return await StudyBuddyStorage.saveFlashcard(payload);

    case 'DELETE_FLASHCARD':
      await StudyBuddyStorage.deleteFlashcard(payload.id);
      return { deleted: true };

    case 'GET_FLASHCARDS':
      return await StudyBuddyStorage.getFlashcards();

    case 'START_FOCUS':
      await startFocusAlarm();
      return await StudyBuddyStorage.startFocusSession();

    case 'PAUSE_FOCUS':
      return await StudyBuddyStorage.pauseFocusSession();

    case 'RESUME_FOCUS':
      return await StudyBuddyStorage.resumeFocusSession();

    case 'STOP_FOCUS': {
      await stopFocusAlarm();
      return await StudyBuddyStorage.stopFocusSession();
    }

    case 'GET_FOCUS_STATE': {
      const active = await StudyBuddyStorage.getActiveFocusSession();
      return {
        session: active,
        elapsed: StudyBuddyStorage.getElapsedFocusSeconds(active)
      };
    }

    case 'SHORTS_SESSION_START':
      return await StudyBuddyStorage.recordShortsSessionStart();

    case 'SHORTS_TIME_UPDATE':
      return await StudyBuddyStorage.updateShortsTime(payload.seconds);

    case 'SHORTS_WATCHED':
      return await StudyBuddyStorage.incrementShortsWatched();

    case 'INTERVENTION_SHOWN':
      return await StudyBuddyStorage.recordIntervention();

    case 'LEARNING_MINUTES_RECOVERED':
      return await StudyBuddyStorage.recordLearningMinutesRecovered(payload.minutes);

    case 'OPEN_DASHBOARD':
      openDashboard();
      return { opened: true };

    case 'UPDATE_STATS':
      return await StudyBuddyStorage.updateStats(payload);

    case 'RECORD_ACTIVITY':
      return await StudyBuddyStorage.registerActivityDay(payload.timestamp || Date.now());

    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  const changedKeys = Object.keys(changes);
  if (changedKeys.length === 0) return;

  chrome.runtime.sendMessage({
    type: 'STORAGE_CHANGED',
    keys: changedKeys
  }).catch(() => {});
});
