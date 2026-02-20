/**
 * IndexedDB Storage Service
 * Replaces localStorage with scalable IndexedDB storage
 * Supports offline-first architecture with sync queue
 */

import { ContactInfo, ExtractionResult } from '../types';

const DB_NAME = 'KKSmartScanDB';
const DB_VERSION = 1;

// Store names
const STORES = {
  CONTACTS: 'contacts',
  CACHE: 'extractionCache',
  SYNC_QUEUE: 'syncQueue',
  SETTINGS: 'settings',
  HISTORY: 'actionHistory'
} as const;

export interface CacheEntry {
  hash: string;
  results: ExtractionResult[];
  timestamp: number;
  expiresAt: number;
}

export interface SyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  data: ContactInfo | string;
  timestamp: number;
  retries: number;
}

export interface HistoryAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  contactId: string;
  previousState: ContactInfo | null;
  newState: ContactInfo | null;
  timestamp: number;
}

let dbInstance: IDBDatabase | null = null;

/**
 * Initialize and get database instance
 */
export async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open database'));

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Contacts store with indexes
      if (!db.objectStoreNames.contains(STORES.CONTACTS)) {
        const contactStore = db.createObjectStore(STORES.CONTACTS, { keyPath: 'id' });
        contactStore.createIndex('email', 'email', { unique: false });
        contactStore.createIndex('phone', 'phone', { unique: false });
        contactStore.createIndex('firmName', 'firmName', { unique: false });
        contactStore.createIndex('industry', 'industry', { unique: false });
        contactStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // Cache store for extraction results
      if (!db.objectStoreNames.contains(STORES.CACHE)) {
        const cacheStore = db.createObjectStore(STORES.CACHE, { keyPath: 'hash' });
        cacheStore.createIndex('expiresAt', 'expiresAt', { unique: false });
      }

      // Sync queue for offline operations
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Settings store
      if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
        db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }

      // Action history for undo/redo
      if (!db.objectStoreNames.contains(STORES.HISTORY)) {
        const historyStore = db.createObjectStore(STORES.HISTORY, { keyPath: 'id' });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

// ==================== CONTACTS ====================

/**
 * Get all contacts
 */
export async function getAllContacts(): Promise<ContactInfo[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CONTACTS, 'readonly');
    const store = transaction.objectStore(STORES.CONTACTS);
    const request = store.getAll();

    request.onsuccess = () => {
      const contacts = request.result || [];
      // Sort by createdAt descending
      contacts.sort((a, b) => b.createdAt - a.createdAt);
      resolve(contacts);
    };
    request.onerror = () => reject(new Error('Failed to get contacts'));
  });
}

/**
 * Get a single contact by ID
 */
export async function getContact(id: string): Promise<ContactInfo | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CONTACTS, 'readonly');
    const store = transaction.objectStore(STORES.CONTACTS);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('Failed to get contact'));
  });
}

/**
 * Save a contact (create or update)
 */
export async function saveContact(contact: ContactInfo, recordHistory = true): Promise<void> {
  const db = await getDB();
  
  // Record history for undo/redo
  if (recordHistory) {
    const existing = await getContact(contact.id);
    await recordAction({
      id: crypto.randomUUID(),
      type: existing ? 'update' : 'create',
      contactId: contact.id,
      previousState: existing,
      newState: contact,
      timestamp: Date.now()
    });
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CONTACTS, 'readwrite');
    const store = transaction.objectStore(STORES.CONTACTS);
    const request = store.put(contact);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to save contact'));
  });
}

/**
 * Save multiple contacts in a batch
 */
export async function saveContacts(contacts: ContactInfo[]): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CONTACTS, 'readwrite');
    const store = transaction.objectStore(STORES.CONTACTS);

    let completed = 0;
    const total = contacts.length;

    if (total === 0) {
      resolve();
      return;
    }

    contacts.forEach(contact => {
      const request = store.put(contact);
      request.onsuccess = () => {
        completed++;
        if (completed === total) resolve();
      };
      request.onerror = () => reject(new Error('Failed to save contacts'));
    });
  });
}

/**
 * Delete a contact by ID
 */
export async function deleteContact(id: string, recordHistory = true): Promise<void> {
  const db = await getDB();

  // Record history for undo/redo
  if (recordHistory) {
    const existing = await getContact(id);
    if (existing) {
      await recordAction({
        id: crypto.randomUUID(),
        type: 'delete',
        contactId: id,
        previousState: existing,
        newState: null,
        timestamp: Date.now()
      });
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CONTACTS, 'readwrite');
    const store = transaction.objectStore(STORES.CONTACTS);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to delete contact'));
  });
}

/**
 * Delete multiple contacts
 */
export async function deleteContacts(ids: string[]): Promise<void> {
  const db = await getDB();
  
  // Record history for each deletion
  for (const id of ids) {
    const existing = await getContact(id);
    if (existing) {
      await recordAction({
        id: crypto.randomUUID(),
        type: 'delete',
        contactId: id,
        previousState: existing,
        newState: null,
        timestamp: Date.now()
      });
    }
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CONTACTS, 'readwrite');
    const store = transaction.objectStore(STORES.CONTACTS);

    let completed = 0;
    const total = ids.length;

    if (total === 0) {
      resolve();
      return;
    }

    ids.forEach(id => {
      const request = store.delete(id);
      request.onsuccess = () => {
        completed++;
        if (completed === total) resolve();
      };
      request.onerror = () => reject(new Error('Failed to delete contacts'));
    });
  });
}

// ==================== CACHE ====================

const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get cached extraction result by image hash
 */
export async function getCachedExtraction(hash: string): Promise<ExtractionResult[] | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CACHE, 'readonly');
    const store = transaction.objectStore(STORES.CACHE);
    const request = store.get(hash);

    request.onsuccess = () => {
      const entry = request.result as CacheEntry | undefined;
      if (entry && entry.expiresAt > Date.now()) {
        resolve(entry.results);
      } else {
        resolve(null);
      }
    };
    request.onerror = () => reject(new Error('Failed to get cache'));
  });
}

/**
 * Save extraction result to cache
 */
export async function setCachedExtraction(hash: string, results: ExtractionResult[]): Promise<void> {
  const db = await getDB();
  const entry: CacheEntry = {
    hash,
    results,
    timestamp: Date.now(),
    expiresAt: Date.now() + CACHE_DURATION
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CACHE, 'readwrite');
    const store = transaction.objectStore(STORES.CACHE);
    const request = store.put(entry);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to set cache'));
  });
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(): Promise<number> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.CACHE, 'readwrite');
    const store = transaction.objectStore(STORES.CACHE);
    const index = store.index('expiresAt');
    const now = Date.now();
    const range = IDBKeyRange.upperBound(now);
    
    let deletedCount = 0;
    const request = index.openCursor(range);

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        deletedCount++;
        cursor.continue();
      } else {
        resolve(deletedCount);
      }
    };
    request.onerror = () => reject(new Error('Failed to clear cache'));
  });
}

// ==================== HISTORY (Undo/Redo) ====================

const MAX_HISTORY_SIZE = 50;

/**
 * Record an action for undo/redo
 */
async function recordAction(action: HistoryAction): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.HISTORY, 'readwrite');
    const store = transaction.objectStore(STORES.HISTORY);
    const request = store.put(action);

    request.onsuccess = async () => {
      // Trim old history if needed
      await trimHistory();
      resolve();
    };
    request.onerror = () => reject(new Error('Failed to record action'));
  });
}

/**
 * Get recent history actions
 */
export async function getHistory(limit = 50): Promise<HistoryAction[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.HISTORY, 'readonly');
    const store = transaction.objectStore(STORES.HISTORY);
    const index = store.index('timestamp');
    const request = index.getAll();

    request.onsuccess = () => {
      const actions = (request.result || []) as HistoryAction[];
      actions.sort((a, b) => b.timestamp - a.timestamp);
      resolve(actions.slice(0, limit));
    };
    request.onerror = () => reject(new Error('Failed to get history'));
  });
}

/**
 * Undo the last action
 */
export async function undoLastAction(): Promise<HistoryAction | null> {
  const history = await getHistory(1);
  if (history.length === 0) return null;

  const action = history[0];
  const db = await getDB();

  // Reverse the action
  const transaction = db.transaction([STORES.CONTACTS, STORES.HISTORY], 'readwrite');
  const contactStore = transaction.objectStore(STORES.CONTACTS);
  const historyStore = transaction.objectStore(STORES.HISTORY);

  return new Promise((resolve, reject) => {
    // Remove the action from history
    historyStore.delete(action.id);

    // Reverse the contact change
    if (action.type === 'create' && action.newState) {
      contactStore.delete(action.contactId);
    } else if (action.type === 'delete' && action.previousState) {
      contactStore.put(action.previousState);
    } else if (action.type === 'update' && action.previousState) {
      contactStore.put(action.previousState);
    }

    transaction.oncomplete = () => resolve(action);
    transaction.onerror = () => reject(new Error('Failed to undo action'));
  });
}

/**
 * Trim history to max size
 */
async function trimHistory(): Promise<void> {
  const history = await getHistory(MAX_HISTORY_SIZE + 10);
  if (history.length <= MAX_HISTORY_SIZE) return;

  const db = await getDB();
  const toDelete = history.slice(MAX_HISTORY_SIZE);

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.HISTORY, 'readwrite');
    const store = transaction.objectStore(STORES.HISTORY);

    toDelete.forEach(action => store.delete(action.id));

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to trim history'));
  });
}

// ==================== MIGRATION ====================

/**
 * Migrate data from localStorage to IndexedDB (one-time)
 */
export async function migrateFromLocalStorage(): Promise<boolean> {
  const db = await getDB();
  
  // Check if already migrated
  const migrated = localStorage.getItem('kksmartscan_migrated_to_idb');
  if (migrated === 'true') return false;

  // Get data from localStorage
  const savedData = localStorage.getItem('kksmartscan_db');
  if (!savedData) {
    localStorage.setItem('kksmartscan_migrated_to_idb', 'true');
    return false;
  }

  try {
    const contacts: ContactInfo[] = JSON.parse(savedData);
    if (contacts.length > 0) {
      await saveContacts(contacts);
      console.log(`Migrated ${contacts.length} contacts to IndexedDB`);
    }
    
    // Mark as migrated, but keep localStorage as backup
    localStorage.setItem('kksmartscan_migrated_to_idb', 'true');
    return true;
  } catch (e) {
    console.error('Migration failed:', e);
    return false;
  }
}

// ==================== SETTINGS ====================

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const db = await getDB();
  return new Promise((resolve) => {
    const transaction = db.transaction(STORES.SETTINGS, 'readonly');
    const store = transaction.objectStore(STORES.SETTINGS);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve(request.result?.value ?? defaultValue);
    };
    request.onerror = () => resolve(defaultValue);
  });
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.SETTINGS, 'readwrite');
    const store = transaction.objectStore(STORES.SETTINGS);
    const request = store.put({ key, value });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to save setting'));
  });
}

// ==================== UTILITIES ====================

/**
 * Clear all data (for testing or reset)
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.CONTACTS, STORES.CACHE, STORES.HISTORY],
      'readwrite'
    );

    transaction.objectStore(STORES.CONTACTS).clear();
    transaction.objectStore(STORES.CACHE).clear();
    transaction.objectStore(STORES.HISTORY).clear();

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('Failed to clear data'));
  });
}

/**
 * Get database statistics
 */
export async function getDbStats(): Promise<{
  contactCount: number;
  cacheEntries: number;
  historyActions: number;
}> {
  const db = await getDB();
  
  const getCounts = (storeName: string): Promise<number> => {
    return new Promise((resolve) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  };

  const [contactCount, cacheEntries, historyActions] = await Promise.all([
    getCounts(STORES.CONTACTS),
    getCounts(STORES.CACHE),
    getCounts(STORES.HISTORY)
  ]);

  return { contactCount, cacheEntries, historyActions };
}
