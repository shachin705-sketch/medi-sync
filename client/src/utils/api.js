const API_BASE = '/api';

export const api = {
  // Authentication
  login: async (email, password) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },

  // Medicines
  getMedicines: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/medicines?${query}`);
    return res.json();
  },

  // PHCs
  getPhcs: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/phcs?${query}`);
    return res.json();
  },

  getPhcById: async (id) => {
    const res = await fetch(`${API_BASE}/phcs/${id}`);
    return res.json();
  },

  // Stock & Days Left
  getDaysOfStock: async (phcId, filters = {}) => {
    const query = new URLSearchParams({ phc: phcId, ...filters }).toString();
    const res = await fetch(`${API_BASE}/stock/days-left?${query}`);
    return res.json();
  },

  getStockHistory: async (phcId, medicineId) => {
    const res = await fetch(`${API_BASE}/stock/history/${phcId}/${medicineId}`);
    return res.json();
  },

  recordStockEntry: async (entryData, token) => {
    try {
      const res = await fetch(`${API_BASE}/stock/entry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(entryData)
      });
      return res.json();
    } catch (err) {
      // If offline, save to offline sync queue in localStorage!
      api.queueOfflineEntry(entryData);
      return { offline_queued: true, message: 'Saved to local offline queue. Will sync automatically.' };
    }
  },

  // Offline Sync Queue Management
  queueOfflineEntry: (entryData) => {
    const queue = JSON.parse(localStorage.getItem('medisync_offline_queue') || '[]');
    queue.push({ ...entryData, queued_at: new Date().toISOString() });
    localStorage.setItem('medisync_offline_queue', JSON.stringify(queue));
  },

  getOfflineQueue: () => {
    return JSON.parse(localStorage.getItem('medisync_offline_queue') || '[]');
  },

  clearOfflineQueue: () => {
    localStorage.removeItem('medisync_offline_queue');
  },

  syncOfflineQueue: async (token) => {
    const queue = api.getOfflineQueue();
    if (queue.length === 0) return { synced: 0 };

    let synced = 0;
    const remaining = [];
    for (const item of queue) {
      try {
        await fetch(`${API_BASE}/stock/entry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(item)
        });
        synced++;
      } catch (err) {
        remaining.push(item);
      }
    }

    localStorage.setItem('medisync_offline_queue', JSON.stringify(remaining));
    return { synced, remaining: remaining.length };
  },

  // Nearby Surplus Finder
  getNearbyStock: async (medicineId, phcId, radius = 100) => {
    const res = await fetch(`${API_BASE}/nearby-stock?medicine=${medicineId}&phc=${phcId}&radius=${radius}`);
    return res.json();
  },

  getMultiBasketNearbyStock: async (medicines, phcId, radius = 100) => {
    const res = await fetch(`${API_BASE}/nearby-stock/multi-basket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ medicines, phc: phcId, radius })
    });
    return res.json();
  },

  // Transfers
  getTransfers: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/transfers?${query}`);
    return res.json();
  },

  getTransferSlip: async (transferId) => {
    const res = await fetch(`${API_BASE}/transfers/${transferId}/slip`);
    return res.json();
  },

  createTransfer: async (transferData, token) => {
    const res = await fetch(`${API_BASE}/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(transferData)
    });
    return res.json();
  },

  updateTransferStatus: async (transferId, status, notes, token) => {
    const res = await fetch(`${API_BASE}/transfers/${transferId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ status, notes })
    });
    return res.json();
  },

  // Emergency Indents
  getIndents: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/indents?${query}`);
    return res.json();
  },

  createIndent: async (indentData, token) => {
    const res = await fetch(`${API_BASE}/indents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(indentData)
    });
    return res.json();
  },

  // Alerts
  getAlerts: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/alerts?${query}`);
    return res.json();
  },

  updateAlertStatus: async (alertId, status, token) => {
    const res = await fetch(`${API_BASE}/alerts/${alertId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ status })
    });
    return res.json();
  },

  // AI & Forecasting
  getForecast: async (phcId, medicineId) => {
    const res = await fetch(`${API_BASE}/ai/forecast/${phcId}/${medicineId}`);
    return res.json();
  },

  getAnomalies: async (phcId) => {
    const res = await fetch(`${API_BASE}/ai/anomalies?phc=${phcId || ''}`);
    return res.json();
  },

  getRedistributionRecommendations: async (phcId) => {
    const res = await fetch(`${API_BASE}/ai/recommendations/redistribution?phc=${phcId || ''}`);
    return res.json();
  },

  getConsolidatedRoutes: async (phcId) => {
    const res = await fetch(`${API_BASE}/ai/recommendations/consolidated-routes?phc=${phcId || ''}`);
    return res.json();
  },

  getAutoDraftIndent: async (phcId, medicineId) => {
    const res = await fetch(`${API_BASE}/ai/recommendations/auto-indent/${phcId}/${medicineId}`);
    return res.json();
  },

  getSeasonalContext: async () => {
    const res = await fetch(`${API_BASE}/ai/seasonal-context`);
    return res.json();
  },

  queryChatbot: async (message, phcId) => {
    const res = await fetch(`${API_BASE}/ai/chatbot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, phc_id: phcId })
    });
    return res.json();
  },

  // Reports
  getDistrictSummary: async () => {
    const res = await fetch(`${API_BASE}/reports/district-summary`);
    return res.json();
  },

  getBlockRiskMap: async (block) => {
    const res = await fetch(`${API_BASE}/reports/block-risk-map?block=${block || ''}`);
    return res.json();
  },

  // Public Medicine Availability
  getPublicAvailability: async (phcId, search = '') => {
    const res = await fetch(`${API_BASE}/public/availability?phc=${phcId}&search=${encodeURIComponent(search)}`);
    return res.json();
  },

  // System Notifications and Audit
  getSystemNotifications: async (token) => {
    const res = await fetch(`${API_BASE}/system/notifications`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    return res.json();
  },

  // Inventory Management & Opening Stock
  getInventory: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/inventory?${query}`);
    return res.json();
  },

  addOpeningStock: async (data) => {
    const res = await fetch(`${API_BASE}/inventory/opening-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  adjustStock: async (data) => {
    const res = await fetch(`${API_BASE}/inventory/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  syncQueue: async (queue) => {
    const res = await fetch(`${API_BASE}/inventory/sync-queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queue })
    });
    return res.json();
  },

  reconcileConflict: async (data) => {
    const res = await fetch(`${API_BASE}/inventory/reconcile-conflict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  getStockMovements: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/inventory/movements?${query}`);
    return res.json();
  },

  getInventoryBatches: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/inventory/batches?${query}`);
    return res.json();
  },

  // Medicine Issue & Billing Lifecycle
  getBills: async (params = {}) => {
    const query = new URLSearchParams(params).toString();
    const res = await fetch(`${API_BASE}/billing?${query}`);
    return res.json();
  },

  getBillById: async (id) => {
    const res = await fetch(`${API_BASE}/billing/${id}`);
    return res.json();
  },

  previewBillingFefo: async (data) => {
    const res = await fetch(`${API_BASE}/billing/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  createDraftBill: async (data) => {
    const res = await fetch(`${API_BASE}/billing/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  confirmBillDispense: async (id, data = {}) => {
    const res = await fetch(`${API_BASE}/billing/${id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  cancelBill: async (id, data = {}) => {
    const res = await fetch(`${API_BASE}/billing/${id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  reverseBill: async (id, data = {}) => {
    const res = await fetch(`${API_BASE}/billing/${id}/reverse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  getDashboardSummary: async () => {
    const res = await fetch(`${API_BASE}/dashboard/summary`);
    return res.json();
  }
};
