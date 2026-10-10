import { useState, useEffect, useCallback } from 'react';
import offlineSyncManager from '../utils/offlineSyncManager';

export function useOfflineSync() {
  const [syncInfo, setSyncInfo] = useState(() => offlineSyncManager.getState());

  useEffect(() => {
    const unsubscribe = offlineSyncManager.subscribe((state) => {
      setSyncInfo(state);
    });
    return unsubscribe;
  }, []);

  const queueOperation = useCallback(async (op) => {
    return await offlineSyncManager.queueOperation(op);
  }, []);

  const syncNow = useCallback(async () => {
    return await offlineSyncManager.syncPendingQueue();
  }, []);

  const toggleSimulatedOffline = useCallback((val) => {
    offlineSyncManager.setSimulatedOffline(val);
  }, []);

  const reconcileConflict = useCallback(async (opId, strategy) => {
    return await offlineSyncManager.reconcileConflict(opId, strategy);
  }, []);

  return {
    ...syncInfo,
    queueOperation,
    syncNow,
    toggleSimulatedOffline,
    reconcileConflict
  };
}

export default useOfflineSync;
