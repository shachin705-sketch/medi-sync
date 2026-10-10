import React, { useState } from 'react';
import { AlertTriangle, Check, RefreshCw, X, ShieldAlert, ArrowRight, Layers } from 'lucide-react';

export default function ConflictResolutionModal({
  isOpen,
  onClose,
  conflicts = [],
  onReconcile
}) {
  const [reconcilingId, setReconcilingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen || conflicts.length === 0) return null;

  const currentConflict = conflicts[0];
  const conflictData = currentConflict.conflict_data || {};
  const payload = currentConflict.payload || {};

  const handleResolve = async (strategy) => {
    setErrorMsg('');
    setReconcilingId(currentConflict.id);
    try {
      const res = await onReconcile(currentConflict.id, strategy);
      if (!res.success) {
        setErrorMsg(res.error || 'Failed to reconcile conflict');
      }
    } catch (e) {
      setErrorMsg(e.message);
    } finally {
      setReconcilingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-red-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-amber-600 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center font-bold">
              <ShieldAlert size={20} className="text-white" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Concurrency Conflict Detected</h3>
              <p className="text-xs text-red-100">
                Safe stock reconciliation required &bull; {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} pending
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5 text-xs text-slate-700">
          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 leading-relaxed">
            <b>Conflict Explanation:</b> Another staff member or central server operation updated stock for this medicine while your device was offline. To protect inventory integrity, changes are held safely in your device queue rather than silently overwriting server data.
          </div>

          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 font-semibold">
              {errorMsg}
            </div>
          )}

          {/* Conflict Details Card */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-2">
              <span className="font-mono text-[11px] font-bold text-slate-500">
                Op ID: {currentConflict.id}
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                Recorded {currentConflict.created_at ? new Date(currentConflict.created_at).toLocaleTimeString() : 'offline'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-slate-800">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Medicine &amp; Batch</span>
                <span className="font-bold text-sm text-slate-900 block">
                  {payload.medicine_name || payload.medicine_id || 'Medicine'}
                </span>
                <span className="font-mono text-xs text-[#0B6E6E]">
                  Batch: {payload.batch_number || 'Standard'}
                </span>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Health Centre</span>
                <span className="font-semibold text-xs text-slate-900 block">
                  {payload.centre_name || payload.phc_id || 'Centre'}
                </span>
                <span className="text-[10px] text-slate-500">
                  Staff: {currentConflict.recorded_by || 'Pharmacist'}
                </span>
              </div>
            </div>

            {/* Comparison Grid */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/70">
              <div className="p-3 rounded-lg bg-white border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Client Offline State</span>
                <div className="text-base font-black text-slate-900 mt-0.5">
                  {conflictData.client_expected_balance ?? currentConflict.last_known_balance ?? 'N/A'} units
                </div>
                <span className="text-[10px] text-amber-700 block mt-0.5">
                  Action: +{payload.quantity_added || payload.quantity_change || 0} units
                </span>
              </div>

              <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200">
                <span className="text-[10px] font-bold text-emerald-700 uppercase block">Authoritative Server Stock</span>
                <div className="text-base font-black text-emerald-800 mt-0.5">
                  {conflictData.server_stock ?? 'Current'} units
                </div>
                <span className="text-[10px] text-emerald-700 block mt-0.5">
                  Live verified server balance
                </span>
              </div>
            </div>
          </div>

          {/* Reconciliation Options */}
          <div className="space-y-2 pt-1">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">
              Select Safe Reconciliation Action:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={reconcilingId !== null}
                onClick={() => handleResolve('accept_server')}
                className="p-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-left transition flex flex-col justify-between cursor-pointer disabled:opacity-50"
              >
                <div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Check size={14} className="text-slate-600" />
                    Accept Server Stock
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Discard offline change and keep the authoritative central server stock balance.
                  </p>
                </div>
                <span className="mt-2 text-[10px] font-bold text-slate-600 uppercase">
                  Safest Choice &rarr;
                </span>
              </button>

              <button
                type="button"
                disabled={reconcilingId !== null}
                onClick={() => handleResolve('force_apply')}
                className="p-3 rounded-xl border border-teal-300 bg-teal-50/40 hover:bg-teal-50 text-left transition flex flex-col justify-between cursor-pointer disabled:opacity-50"
              >
                <div>
                  <div className="font-bold text-teal-950 flex items-center gap-1.5">
                    <RefreshCw size={14} className="text-[#0B6E6E]" />
                    Re-apply Offline Entry
                  </div>
                  <p className="text-[11px] text-slate-600 mt-1 leading-snug">
                    Apply this stock entry on top of current server stock and record an audited ledger movement.
                  </p>
                </div>
                <span className="mt-2 text-[10px] font-bold text-[#0B6E6E] uppercase">
                  Apply Intake &rarr;
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Offline items remain preserved on device until resolved.
          </span>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            Review Later
          </button>
        </div>
      </div>
    </div>
  );
}
