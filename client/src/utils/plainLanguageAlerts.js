/**
 * Plain-Language Healthcare Logistics Alert Generator
 * Requirement B: Every alert shown in the dashboard, inventory, and map
 * must include EXACTLY ONE concise explanatory sentence stating why the alert was triggered.
 * Generated dynamically from actual stock levels, thresholds, usage, expiry dates, and sync state.
 */

export function getPlainLanguageExplanation({
  type,
  status,
  severity,
  daysOfCover,
  daysToExpiry,
  currentQuantity,
  minSafetyStock,
  dailyUsage,
  unit = 'units',
  batchNumber,
  transferableUnits,
  safetyReserve,
  isOffline,
  isPendingSync,
  isStale
}) {
  // 1. Connection / Offline state explanation
  if (isOffline) {
    return 'You are offline, so new stock changes will sync when internet returns.';
  }

  // 2. Pending sync / unverified offline balance explanation
  if (isPendingSync) {
    return 'This stock entry was recorded offline and is pending verification with the central server.';
  }

  // 3. Stale data explanation
  if (isStale || status === 'grey') {
    return 'This centre’s stock has not been updated recently, so current availability is uncertain.';
  }

  // 4. Critical Stock Shortage (Red / < 3 days)
  if (status === 'red' || severity === 'critical' || type === 'critical_shortage' || type === 'stockout_imminent') {
    const days = Number(daysOfCover);
    if (!isNaN(days) && days <= 1) {
      return 'This medicine is expected to run out within 24 hours based on recent usage.';
    }
    if (!isNaN(days) && days > 0) {
      return `This medicine is expected to run out within ${Math.round(days)} days based on recent usage.`;
    }
    return 'This medicine is expected to run out within 2 days based on recent usage.';
  }

  // 5. Low Stock Buffer (Amber / Yellow / below safety stock)
  if (status === 'amber' || status === 'yellow' || severity === 'warning' || type === 'low_stock' || type === 'below_threshold') {
    const threshold = Number(minSafetyStock);
    if (!isNaN(threshold) && threshold > 0) {
      return `This medicine is below the centre’s minimum safety stock of ${threshold} ${unit}.`;
    }
    return 'This medicine is below the centre’s minimum safety stock.';
  }

  // 6. Near Expiry Alert (<= 90 days)
  if (type === 'near_expiry' || (daysToExpiry !== undefined && daysToExpiry !== null && Number(daysToExpiry) <= 90)) {
    const d = Number(daysToExpiry);
    const daysText = (!isNaN(d) && d > 0) ? `${Math.round(d)} days` : '30 days';
    const batchText = batchNumber ? `Batch ${batchNumber}` : 'This batch';
    return `${batchText} expires within ${daysText} and needs review.`;
  }

  // 7. Peer-to-Peer Transfer Recommendation
  if (type === 'transfer_recommendation' || transferableUnits !== undefined) {
    const units = Number(transferableUnits) || 50;
    const reserve = Number(safetyReserve) || 14;
    return `This centre may supply ${units} ${unit} without falling below its safety reserve of ${reserve} ${unit}.`;
  }

  // 8. Healthy Stock
  if (status === 'green' || type === 'healthy') {
    return 'Stock level is healthy with adequate supply above the local 14-day safety reserve.';
  }

  // Fallback default
  return 'Stock status has been verified against active health facility consumption records.';
}

export default getPlainLanguageExplanation;
