/**
 * IndexedDB Offline Database for VelocityRx / MediAlert AI
 * Handles persistent offline queueing, local inventory caching, and sync states.
 * Transparent fallback to localStorage if IndexedDB is blocked.
 */

const DB_NAME = 'velocityrx_offline_db';
const DB_VERSION = 1;
const QUEUE_STORE = 'sync_queue';
const INVENTORY_STORE = 'cached_inventory';
const METADATA_STORE = 'offline_metadata';

let dbInstance = null;

function isIndexedDBAvailable() {
  try {
    return typeof window !== 'undefined' && 'indexedDB' in window && window.indexedDB !== null;
  } catch (e) {
    return false;
  }
}

/**
 * Open or create IndexedDB instance
 */
export async function openOfflineDb() {
  if (dbInstance) return dbInstance;
  if (!isIndexedDBAvailable()) {
    console.warn('[OfflineDB] IndexedDB unavailable, using localStorage fallback');
    return null;
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
          queueStore.createIndex('status', 'status', { unique: false });
          queueStore.createIndex('created_at', 'created_at', { unique: false });
          queueStore.createIndex('phc_id', 'phc_id', { unique: false });
        }
        if (!db.objectStoreNames.contains(INVENTORY_STORE)) {
          db.createObjectStore(INVENTORY_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (err) => {
        console.error('[OfflineDB] Error opening IndexedDB:', err);
        resolve(null);
      };
    } catch (e) {
      console.error('[OfflineDB] IndexedDB open error:', e);
      resolve(null);
    }
  });
}

// -------------------------------------------------------------
// LOCALSTORAGE FALLBACK HELPERS
// -------------------------------------------------------------
const LS_QUEUE_KEY = 'vrx_offline_queue';
const LS_CACHE_KEY = 'vrx_offline_cache';

function getLsQueue() {
  try {
    const raw = localStorage.getItem(LS_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLsQueue(items) {
  try {
    localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(items));
  } catch (e) {}
}

// -------------------------------------------------------------
// QUEUE OPERATIONS
// -------------------------------------------------------------

/**
 * Queue an offline stock operation (Opening Stock, Adjustment, Issue)
 * Assigns a unique operation ID so retries never create duplicate stock movements.
 */
export async function queueOfflineOperation(operation) {
  const db = await openOfflineDb();
  const operationId = operation.id || `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const item = {
    ...operation,
    id: operationId,
    status: 'pending', // 'pending' | 'syncing' | 'failed' | 'conflict'
    created_at: operation.created_at || new Date().toISOString(),
    client_timestamp: Date.now(),
    retry_count: operation.retry_count || 0,
    error_message: null,
    conflict_data: null
  };

  if (db) {
    return new Promise((resolve, reject) => {
      try {
        const tx = db.transaction([QUEUE_STORE], 'readwrite');
        const store = tx.objectStore(QUEUE_STORE);
        const req = store.put(item);
        req.onsuccess = () => resolve(item);
        req.onerror = (e) => reject(e);
      } catch (err) {
        // Fallback to localStorage
        const q = getLsQueue();
        q.push(item);
        saveLsQueue(q);
        resolve(item);
      }
    });
  } else {
    const q = getLsQueue();
    const existingIndex = q.findIndex(i => i.id === operationId);
    if (existingIndex >= 0) q[existingIndex] = item;
    else q.push(item);
    saveLsQueue(q);
    return item;
  }
}

/**
 * Get all pending, failed, or conflicted items from the queue
 */
export async function getPendingQueue() {
  const db = await openOfflineDb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([QUEUE_STORE], 'readonly');
        const store = tx.objectStore(QUEUE_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve(getLsQueue());
      } catch (e) {
        resolve(getLsQueue());
      }
    });
  }
  return getLsQueue();
}

/**
 * Update an existing queue item (e.g. status, conflict data, error)
 */
export async function updateQueueItem(id, updates) {
  const db = await openOfflineDb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([QUEUE_STORE], 'readwrite');
        const store = tx.objectStore(QUEUE_STORE);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          if (getReq.result) {
            const updated = { ...getReq.result, ...updates, updated_at: new Date().toISOString() };
            store.put(updated);
            resolve(updated);
          } else {
            resolve(null);
          }
        };
        getReq.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  const q = getLsQueue();
  const idx = q.findIndex(i => i.id === id);
  if (idx >= 0) {
    q[idx] = { ...q[idx], ...updates, updated_at: new Date().toISOString() };
    saveLsQueue(q);
    return q[idx];
  }
  return null;
}

/**
 * Remove an item from the queue after successful sync confirmation
 */
export async function removeQueueItem(id) {
  const db = await openOfflineDb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([QUEUE_STORE], 'readwrite');
        const store = tx.objectStore(QUEUE_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
      } catch (e) {
        resolve(false);
      }
    });
  }

  const q = getLsQueue().filter(i => i.id !== id);
  saveLsQueue(q);
  return true;
}

/**
 * Clear the entire queue
 */
export async function clearQueue() {
  const db = await openOfflineDb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([QUEUE_STORE], 'readwrite');
        const store = tx.objectStore(QUEUE_STORE);
        store.clear();
        resolve(true);
      } catch (e) {
        resolve(false);
      }
    });
  }
  saveLsQueue([]);
  return true;
}

// -------------------------------------------------------------
// CACHED INVENTORY & VERIFIED BALANCE
// -------------------------------------------------------------

/**
 * Cache current server inventory snapshot with verification timestamp
 */
export async function setCachedInventory(items = []) {
  const db = await openOfflineDb();
  const timestamp = new Date().toISOString();

  if (db) {
    try {
      const tx = db.transaction([INVENTORY_STORE], 'readwrite');
      const store = tx.objectStore(INVENTORY_STORE);
      store.clear();
      items.forEach(item => {
        store.put({
          ...item,
          last_verified_at: timestamp,
          is_verified: true
        });
      });
    } catch (e) {}
  }

  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify({
      timestamp,
      items
    }));
  } catch (e) {}
}

/**
 * Get cached inventory snapshot
 */
export async function getCachedInventory() {
  const db = await openOfflineDb();
  if (db) {
    return new Promise((resolve) => {
      try {
        const tx = db.transaction([INVENTORY_STORE], 'readonly');
        const store = tx.objectStore(INVENTORY_STORE);
        const req = store.getAll();
        req.onsuccess = () => {
          if (req.result && req.result.length > 0) resolve(req.result);
          else resolve(getFallbackCache());
        };
        req.onerror = () => resolve(getFallbackCache());
      } catch (e) {
        resolve(getFallbackCache());
      }
    });
  }
  return getFallbackCache();
}

function getFallbackCache() {
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    return raw ? JSON.parse(raw).items || [] : [];
  } catch (e) {
    return [];
  }
}

/**
 * Clear locally stored offline data on authorized user sign-out
 */
export async function clearOfflineDataOnSignOut() {
  const db = await openOfflineDb();
  if (db) {
    try {
      const tx = db.transaction([QUEUE_STORE, INVENTORY_STORE, METADATA_STORE], 'readwrite');
      tx.objectStore(QUEUE_STORE).clear();
      tx.objectStore(INVENTORY_STORE).clear();
      tx.objectStore(METADATA_STORE).clear();
    } catch (e) {}
  }
  localStorage.removeItem(LS_QUEUE_KEY);
  localStorage.removeItem(LS_CACHE_KEY);
  console.log('[OfflineDB] Cleared local data on sign-out.');
}
