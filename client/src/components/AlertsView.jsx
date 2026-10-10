import { useState } from 'react';
import { AlertTriangle, Clock, ShieldAlert, CheckCircle, FileText, Bell, Filter, Check, Info } from 'lucide-react';
import { getPlainLanguageExplanation } from '../utils/plainLanguageAlerts';

export default function AlertsView({
  alerts = [],
  onAcknowledgeAlert,
  onRequestTransfer,
  onInspectCentre
}) {
  const [filterType, setFilterType] = useState('all');

  const filteredAlerts = alerts.filter((alt) => {
    if (filterType === 'all') return true;
    if (filterType === 'critical') return alt.severity === 'critical';
    if (filterType === 'warning') return alt.severity === 'warning';
    if (filterType === 'expiry') return (alt.message || '').toLowerCase().includes('fefo') || (alt.message || '').toLowerCase().includes('expir');
    if (filterType === 'stale') return (alt.message || '').toLowerCase().includes('stale') || (alt.centre || '').includes('Kovalam');
    return true;
  });

  return (
    <div className="space-y-5 rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
      {/* Header */}
      <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#D62839] text-white">
              <Bell size={16} />
            </span>
            <h2 className="font-serif text-2xl font-bold text-ink">Clinical &amp; Logistics Alerts Central</h2>
            <span className="rounded-full bg-red-100 text-red-800 px-2.5 py-0.5 text-[10px] font-bold">
              {alerts.length} Active Alerts
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Real-time notifications with clear, plain-language explanations of stock risks, expiry, and logistics bottlenecks.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'all', label: 'All Alerts' },
            { id: 'critical', label: 'Critical Risk' },
            { id: 'warning', label: 'Warnings' },
            { id: 'expiry', label: 'FEFO Expiry' },
            { id: 'stale', label: 'Stale Data' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition border cursor-pointer ${
                filterType === tab.id
                  ? 'border-[#0B6E6E] bg-[#EAF4F4] text-[#0B6E6E]'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alerts Grid */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No active alerts matching the selected filter.
          </div>
        ) : (
          filteredAlerts.map((alt) => {
            const plainExplanation = getPlainLanguageExplanation({
              type: alt.alert_type || (alt.message && alt.message.includes('expires') ? 'near_expiry' : null),
              severity: alt.severity,
              status: alt.severity === 'critical' ? 'red' : 'amber',
              daysOfCover: alt.days_left || (alt.severity === 'critical' ? 2 : 7),
              daysToExpiry: alt.days_to_expiry || 36,
              minSafetyStock: alt.min_safety_stock || 14,
              unit: alt.unit || 'units',
              batchNumber: alt.batch_number || alt.fefoBatch,
              isStale: alt.centre && alt.centre.includes('Kovalam')
            });

            return (
              <div
                key={alt.id}
                className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                  alt.severity === 'critical'
                    ? 'border-red-200 bg-red-50/40'
                    : 'border-amber-200 bg-amber-50/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl flex-shrink-0 mt-0.5 ${
                    alt.severity === 'critical' ? 'bg-red-100 text-[#D62839]' : 'bg-amber-100 text-[#E09F1F]'
                  }`}>
                    <AlertTriangle size={18} />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.2 rounded-full font-bold uppercase text-[9px] text-white ${
                        alt.severity === 'critical' ? 'bg-[#D62839]' : 'bg-[#E09F1F]'
                      }`}>
                        {alt.severity}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">{alt.centre}</span>
                      <span className="text-slate-400 font-mono text-[10px]">&bull; {alt.time}</span>
                      {alt.status === 'acknowledged' && (
                        <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.2 rounded-full font-medium">
                          Acknowledged
                        </span>
                      )}
                    </div>

                    {/* REQUIREMENT B: Exactly ONE concise explanatory sentence */}
                    <p className="text-xs text-slate-900 font-medium leading-relaxed bg-white/70 border border-slate-200/60 px-2.5 py-1.5 rounded-lg">
                      {plainExplanation}
                    </p>

                    <div className="text-[11px] text-slate-500 font-medium flex items-center gap-2">
                      <span>Medicine Affected: <b>{alt.medicine}</b></span>
                      {alt.message && (
                        <span className="text-slate-400 text-[10px] hidden md:inline">({alt.message})</span>
                      )}
                    </div>
                  </div>
                </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                <button
                  onClick={() => {
                    if (onAcknowledgeAlert) onAcknowledgeAlert(alt.id);
                  }}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Check size={13} className="inline mr-1" /> Acknowledge
                </button>
                <button
                  onClick={() => {
                    if (onRequestTransfer) onRequestTransfer(alt);
                  }}
                  className="rounded-full bg-[#0B6E6E] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#095959] transition shadow-2xs"
                >
                  Request Stock &rarr;
                </button>
              </div>
            </div>
          );
        })
      )}
      </div>
    </div>
  );
}
