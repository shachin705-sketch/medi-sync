/**
 * Offline Synchronization Manager for VelocityRx / MediAlert AI
 * Manages connection status, IndexedDB sync queue, conflict detection,
 * automatic reconnect sync, and manual retry triggers.
 */

import {
  queueOfflineOperation,
  getPendingQueue,
  updateQueueItem,
  removeQueueItem,
  clearQueue
} from './offlineDb';

export const CONNECTION_STATES = {
  ONLINE: 'Online',
  OFFLINE: 'Offline'
};

export const SYNC_STATES = {
  SYNCED: 'Synced',
  PENDING_SYNC: 'Pending Sync',
  SYNCING: 'Syncing',
  SYNC_FAILED: 'Sync Failed',
  CONFLICT: 'Conflict'
};

class OfflineSyncManager {
  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    this.isSimulatedOffline = false;
    this.syncState = SYNC_STATES.SYNCED;
    this.pendingQueue = [];
    this.listeners = new Set();
    this.lastVerifiedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    this.syncInProgress = false;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleNetworkChange(true));
      window.addEventListener('offline', () => this.handleNetworkChange(false));
      // Initial queue load
      this.refreshQueue();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    // Trigger immediately with current state
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  notify() {
    const state = this.getState();
    this.listeners.forEach((fn) => fn(state));
  }

  getState() {
    const effectivelyOnline = this.isOnline && !this.isSimulatedOffline;
    return {
      connectionState: effectivelyOnline ? CONNECTION_STATES.ONLINE : CONNECTION_STATES.OFFLINE,
      isOnline: effectivelyOnline,
      isSimulatedOffline: this.isSimulatedOffline,
      syncState: this.syncState,
      pendingCount: this.pendingQueue.length,
      pendingQueue: this.pendingQueue,
      lastVerifiedAt: this.lastVerifiedAt,
      hasConflicts: this.pendingQueue.some(i => i.status === 'conflict')
    };
  }

  setSimulatedOffline(val) {
    this.isSimulatedOffline = Boolean(val);
    if (!this.isSimulatedOffline && this.isOnline) {
      // Reconnected from simulation -> trigger auto-sync!
      this.syncPendingQueue();
    } else {
      this.notify();
    }
  }

  async handleNetworkChange(isOnline) {
    this.isOnline = isOnline;
    if (isOnline && !this.isSimulatedOffline) {
      console.log('[OfflineSync] Network reconnected. Attempting automatic sync...');
      await this.syncPendingQueue();
    } else {
      console.log('[OfflineSync] Network offline. Changes will be saved locally in IndexedDB.');
      this.notify();
    }
  }

  async refreshQueue() {
    this.pendingQueue = await getPendingQueue();
    if (this.pendingQueue.length > 0) {
      const hasConflict = this.pendingQueue.some(i => i.status === 'conflict');
      const hasFailed = this.pendingQueue.some(i => i.status === 'failed');
      if (hasConflict) this.syncState = SYNC_STATES.CONFLICT;
      else if (hasFailed) this.syncState = SYNC_STATES.SYNC_FAILED;
      else this.syncState = SYNC_STATES.PENDING_SYNC;
    } else {
      this.syncState = SYNC_STATES.SYNCED;
    }
    this.notify();
  }

  /**
   * Queue a new stock operation
   */
  async queueOperation(operation) {
    const queuedItem = await queueOfflineOperation(operation);
    await this.refreshQueue();

    // If online, immediately attempt to sync
    if (this.isOnline && !this.isSimulatedOffline) {
      this.syncPendingQueue();
    }

    return queuedItem;
  }

  /**
   * Synchronize all queued items with the server
   * Handles idempotency, server validations, and concurrent conflict detection.
   */
  async syncPendingQueue() {
    if (this.syncInProgress) return;
    if (!this.isOnline || this.isSimulatedOffline) {
      this.notify();
      return;
    }

    await this.refreshQueue();
    if (this.pendingQueue.length === 0) {
      this.syncState = SYNC_STATES.SYNCED;
      this.notify();
      return;
    }

    this.syncInProgress = true;
    this.syncState = SYNC_STATES.SYNCING;
    this.notify();

    try {
      const res = await fetch('/api/inventory/sync-queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue: this.pendingQueue })
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const results = data.results || [];

      for (const result of results) {
        if (result.status === 'synced' || result.status === 'already_processed') {
          // Successfully synced on server -> safely delete from device queue
          await removeQueueItem(result.id);
        } else if (result.status === 'conflict') {
          // Concurrent conflict detected -> keep in queue and require safe reconciliation
          await updateQueueItem(result.id, {
            status: 'conflict',
            conflict_data: result
          });
        } else if (result.status === 'failed') {
          // Validation error (e.g. expired batch)
          await updateQueueItem(result.id, {
            status: 'failed',
            error_message: result.error || 'Server validation failed'
          });
        }
      }

      this.lastVerifiedAt = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      await this.refreshQueue();

    } catch (err) {
      console.error('[OfflineSync] Sync failed due to network or server error:', err);
      this.syncState = SYNC_STATES.SYNC_FAILED;
      this.notify();
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Safe conflict reconciliation
   */
  async reconcileConflict(operationId, resolutionStrategy) {
    try {
      const item = this.pendingQueue.find(i => i.id === operationId);
      const res = await fetch('/api/inventory/reconcile-conflict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation_id: operationId,
          resolution: resolutionStrategy, // 'accept_server' | 'force_apply'
          operation_data: item
        })
      });

      if (res.ok) {
        await removeQueueItem(operationId);
        await this.refreshQueue();
        return { success: true };
      } else {
        const err = await res.json();
        return { success: false, error: err.error };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// Export Singleton Instance
export const offlineSyncManager = new OfflineSyncManager();
export default offlineSyncManager;
