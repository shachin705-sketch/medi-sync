import React, { useState } from 'react';
import {
  Cpu, Zap, ShieldCheck, UserCheck, RefreshCw, Lock, Building,
  Clock, AlertTriangle, ChevronRight, CheckCircle2
} from 'lucide-react';

export default function AutomationEngineBar({
  statusData,
  onPolicyChange,
  onTriggerCycle,
  onOpenReservations,
  isLoading
}) {
  const [isChangingPolicy, setIsChangingPolicy] = useState(false);

  const policy = statusData?.approval_policy || 'AUTO';
  const metrics = statusData?.metrics || {};
  const isAutoPolicy = policy === 'AUTO';

  const handleTogglePolicy = async () => {
    const nextPolicy = isAutoPolicy ? 'MANUAL' : 'AUTO';
    setIsChangingPolicy(true);
    try {
      await onPolicyChange(nextPolicy);
    } finally {
      setIsChangingPolicy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
      {/* Top row: Engine status, policy switch, trigger button */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 border border-teal-200 text-[#0B6E6E] shadow-2xs">
            <Cpu size={20} className="animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Autonomous Redistribution Engine
              </h3>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                Active &bull; 30s Interval
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Evaluates usable batch runway, discovers same-district safe donors (&gt;14d buffer), locks FEFO reservations, and escalates shortages.
            </p>
          </div>
        </div>

        {/* Right actions: Policy toggle & trigger button */}
        <div className="flex items-center gap-2.5 self-start lg:self-auto flex-wrap">
          {/* Policy Switcher */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase px-1.5 hidden sm:inline">
              Policy:
            </span>
            <button
              type="button"
              onClick={handleTogglePolicy}
              disabled={isChangingPolicy}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                isAutoPolicy
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
              title="Policy A: Automatically approves requisitions within auto threshold (<=200 units) from same-district donors"
            >
              <Zap size={13} />
              <span>Policy A (Auto)</span>
            </button>

            <button
              type="button"
              onClick={handleTogglePolicy}
              disabled={isChangingPolicy}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition cursor-pointer ${
                !isAutoPolicy
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
              title="Policy B: Requires human review by Medical Officer / Pharmacist before approving stock transfer"
            >
              <UserCheck size={13} />
              <span>Policy B (Human)</span>
            </button>
          </div>

          {/* Trigger Cycle Now */}
          <button
            type="button"
            onClick={onTriggerCycle}
            disabled={isLoading}
            className="flex items-center gap-1.5 rounded-xl bg-[#0B6E6E] text-white px-3.5 py-2 text-xs font-bold hover:bg-[#085454] transition shadow-2xs cursor-pointer disabled:opacity-60"
            title="Execute immediate end-to-end stock evaluation, donor discovery, and state machine transition"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>{isLoading ? 'Running...' : 'Run Cycle Now'}</span>
          </button>
        </div>
      </div>

      {/* KPI Badges Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {/* 1. Auto-Generated Requisitions */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Zap size={11} className="text-teal-600" />
              Auto Requisitions
            </div>
            <div className="text-lg font-black text-slate-900 mt-0.5">
              {metrics.total_auto_requisitions || 0}
            </div>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">
            {metrics.auto_approved_count || 0} Auto-Approved
          </span>
        </div>

        {/* 2. Stock Reservations Active */}
        <button
          type="button"
          onClick={onOpenReservations}
          className="rounded-xl border border-blue-200 bg-blue-50/50 p-2.5 flex items-center justify-between hover:bg-blue-100/60 transition text-left cursor-pointer group"
        >
          <div>
            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider flex items-center gap-1">
              <Lock size={11} className="text-blue-600" />
              Stock Reservations
            </div>
            <div className="text-lg font-black text-blue-900 mt-0.5">
              {metrics.active_reservations || 0} Batches
            </div>
          </div>
          <span className="text-[10px] font-bold text-blue-700 group-hover:translate-x-0.5 transition flex items-center">
            View &rarr;
          </span>
        </button>

        {/* 3. District Warehouse Escalations */}
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-2.5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1">
              <Building size={11} className="text-purple-600" />
              DDW Escalations
            </div>
            <div className="text-lg font-black text-purple-900 mt-0.5">
              {metrics.warehouse_escalated_count || 0}
            </div>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
            Direct Central
          </span>
        </div>

        {/* 4. Awaiting Human Review (Policy B) */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-2.5 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
              <Clock size={11} className="text-amber-600" />
              Awaiting Review
            </div>
            <div className="text-lg font-black text-amber-900 mt-0.5">
              {metrics.awaiting_approval_count || 0}
            </div>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
            {metrics.awaiting_approval_count > 0 ? 'Action Req' : 'Clear'}
          </span>
        </div>
      </div>
    </div>
  );
}
