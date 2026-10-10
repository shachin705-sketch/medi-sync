import { useEffect, useState } from 'react';
import { X, TrendingDown, Clock, ShieldAlert, Sparkles, Navigation, Send, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { api } from '../utils/api';

export default function MedicineDetailModal({ medicine, phcId, onClose, onFindSurplus, onDraftIndent }) {
  const [historyData, setHistoryData] = useState([]);
  const [forecastData, setForecastData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!medicine || !phcId) return;

    setLoading(true);
    Promise.all([
      api.getStockHistory(phcId, medicine.medicine_id),
      api.getForecast(phcId, medicine.medicine_id)
    ])
      .then(([histRes, fcRes]) => {
        setHistoryData(histRes.history || []);
        setForecastData(fcRes);
      })
      .catch((err) => console.error('Failed to load medicine charts:', err))
      .finally(() => setLoading(false));
  }, [medicine, phcId]);

  if (!medicine) return null;

  // Format last 30 days history for chart
  const formattedHistory = historyData.slice(-30).map((h) => ({
    date: h.entry_date.slice(5),
    dispensed: h.dispensed_quantity,
    closing: h.closing_stock
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                medicine.status === 'red' ? 'bg-red-100 text-red-700' :
                medicine.status === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
              }`}>
                {medicine.status_label}
              </span>
              {medicine.critical_flag && (
                <span className="bg-red-50 text-red-600 border border-red-200 text-[10px] px-1.5 py-0.5 rounded font-bold">
                  ⚡ Critical Essential
                </span>
              )}
              {medicine.cold_chain_flag && (
                <span className="bg-blue-50 text-blue-600 border border-blue-200 text-[10px] px-1.5 py-0.5 rounded font-bold">
                  ❄️ Cold-Chain (2-8°C)
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1">{medicine.medicine_name}</h2>
            <p className="text-xs text-slate-500">{medicine.generic_name} &bull; {medicine.strength} &bull; {medicine.category}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500 font-medium">Current Stock</div>
              <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                {medicine.current_quantity} <span className="text-xs font-normal text-slate-500">{medicine.unit}</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">Batch: {medicine.batch_number || 'N/A'}</div>
            </div>

            <div className={`rounded-xl border p-3.5 ${
              medicine.status === 'red' ? 'border-red-200 bg-red-50/60' :
              medicine.status === 'amber' ? 'border-amber-200 bg-amber-50/60' : 'border-emerald-200 bg-emerald-50/60'
            }`}>
              <div className="text-xs font-medium text-slate-600">Days Left</div>
              <div className={`text-xl font-extrabold mt-0.5 ${
                medicine.status === 'red' ? 'text-red-700' :
                medicine.status === 'amber' ? 'text-amber-700' : 'text-emerald-700'
              }`}>
                {medicine.days_left} <span className="text-xs font-normal">days</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1">
                Threshold: {medicine.red_threshold} days
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500 font-medium">Daily Consumption</div>
              <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                {medicine.adc7} <span className="text-xs font-normal text-slate-500">/day</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">30-Day Avg: {medicine.adc30}/day</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <div className="text-xs text-slate-500 font-medium">Projected Depletion</div>
              <div className="text-base font-bold text-slate-900 mt-1">
                {forecastData?.projected_runout_date || 'Calculating...'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                <Clock size={12} /> {forecastData?.projected_days_left || medicine.days_left} days left
              </div>
            </div>
          </div>

          {/* AI Clinical Insights Banner */}
          {forecastData?.seasonal_context && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-4 flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-teal-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-teal-950">
                <div className="font-bold text-teal-900">
                  AI Epidemiological Forecasting Context: {forecastData.seasonal_context.season}
                </div>
                <div className="mt-1 leading-relaxed text-teal-900/90">
                  Tamil Nadu seasonal pattern multiplier is currently active (<b>{forecastData.seasonal_context.multiplier}x</b> demand spike).
                  Forecasted daily dispensing rate: <b>{forecastData.forecasted_daily_rate} {medicine.unit}/day</b>.
                  Recommended safety buffer adjustment: <b>+{forecastData.seasonal_context.bufferIncreaseDays} days</b>.
                </div>
              </div>
            </div>
          )}

          {/* Recharts Historical Consumption Curve */}
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center justify-between">
              <span>30-Day Daily Consumption & Closing Stock Velocity</span>
              <span className="text-[11px] font-normal text-slate-500">Unit: {medicine.unit}</span>
            </h4>
            {loading ? (
              <div className="h-52 flex items-center justify-center text-xs text-slate-400">Loading charts...</div>
            ) : (
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={formattedHistory}>
                    <defs>
                      <linearGradient id="colorClosing" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0D9488" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F172A', color: '#FFF', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Area type="monotone" dataKey="closing" stroke="#0D9488" strokeWidth={2} fillOpacity={1} fill="url(#colorClosing)" name="Closing Stock" />
                    <Line type="monotone" dataKey="dispensed" stroke="#EA580C" strokeWidth={2} dot={{ r: 2 }} name="Daily Dispensed" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* 14-Day Future Depletion Forecast */}
          {forecastData?.future_projections && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3 flex items-center justify-between">
                <span>AI Predicted 14-Day Stock Depletion Projection</span>
                <span className="text-[11px] font-semibold text-red-600">
                  Stock-out Expected: {forecastData.projected_runout_date}
                </span>
              </h4>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecastData.future_projections}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0F172A', color: '#FFF', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Line type="monotone" dataKey="projectedStock" stroke="#DC2626" strokeWidth={2.5} strokeDasharray="4 4" dot={{ r: 3 }} name="Projected Stock" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-4">
          <div className="text-xs text-slate-500">
            * All forecasts are AI clinical decision supports. Human Medical Officer approval is required.
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                onClose();
                if (onFindSurplus) onFindSurplus(medicine);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-bold text-white hover:bg-teal-700 shadow-sm transition"
            >
              <Navigation size={14} /> Find Nearby Surplus
            </button>
            <button
              onClick={() => {
                onClose();
                if (onDraftIndent) onDraftIndent(medicine);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-900 shadow-sm transition"
            >
              <Send size={14} /> Draft Emergency Indent
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
