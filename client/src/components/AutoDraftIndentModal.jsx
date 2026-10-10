import { useState, useEffect } from 'react';
import { X, Send, Sparkles, Building2, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';

export default function AutoDraftIndentModal({ initialMedicine, phcId, onClose, onSuccess }) {
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(400);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initialMedicine || !phcId) return;

    setLoading(true);
    api.getAutoDraftIndent(phcId, initialMedicine.medicine_id)
      .then((data) => {
        setDraft(data);
        setQuantity(data.suggested_quantity);
        setReason(data.draft_reason);
      })
      .catch((err) => console.error('Failed to get auto-indent draft:', err))
      .finally(() => setLoading(false));
  }, [initialMedicine, phcId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!draft) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await api.createIndent({
        phc_id: phcId,
        medicine_id: draft.medicine_id,
        requested_quantity: Number(quantity),
        reason,
        consumption_rate: draft.consumption_rate,
        notes: `AI-Assisted Emergency Indent generated during ${draft.seasonal_disease}`
      });

      if (res.error) {
        setError(res.error);
      } else {
        if (onSuccess) onSuccess(res);
        onClose();
      }
    } catch (err) {
      setError('Failed to submit emergency indent: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!initialMedicine) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
              <Building2 size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">District Emergency Indent</h3>
              <p className="text-xs text-slate-500">Order from District Drug Warehouse outside monthly cycle</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading AI consumption model...</div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
                <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* AI Recommendation Box */}
            <div className="rounded-xl border border-teal-200 bg-teal-50/70 p-3.5">
              <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
                <Sparkles size={14} className="text-teal-600" />
                AI Smart Indent Suggester
              </div>
              <div className="text-xs text-teal-950 mt-1 leading-relaxed">
                Based on current consumption ({draft?.consumption_rate} {draft?.unit}/day) and seasonal buffer requirements ({draft?.seasonal_disease}), the recommended order is <b>{draft?.suggested_quantity} {draft?.unit}</b>.
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Item to Requisition</label>
              <input
                type="text"
                readOnly
                value={`${draft?.medicine_name} (${draft?.unit})`}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Current Stock on Hand</label>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-800">
                  {draft?.current_quantity} {draft?.unit} ({draft?.days_left} days left)
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Requested Quantity ({draft?.unit})</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-teal-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Requisition Justification</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
                required
              />
            </div>

            {/* Footer Controls */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-black shadow-sm transition disabled:opacity-50 flex items-center gap-1.5"
              >
                <Send size={13} /> {submitting ? 'Submitting...' : 'Submit Emergency Indent'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
