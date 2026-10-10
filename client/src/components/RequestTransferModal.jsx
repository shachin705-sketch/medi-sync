import { useState, useEffect } from 'react';
import { X, Truck, ShieldAlert, CheckCircle, AlertTriangle } from 'lucide-react';
import { api } from '../utils/api';

export default function RequestTransferModal({ initialData, phcs = [], onClose, onSuccess }) {
  const [sourcePhcId, setSourcePhcId] = useState(initialData?.source_phc_id || '');
  const [destPhcId, setDestPhcId] = useState(initialData?.dest_phc_id || 'phc-thiruporur');
  const [medicineId, setMedicineId] = useState(initialData?.medicine_id || '');
  const [medicineName, setMedicineName] = useState(initialData?.medicine_name || '');
  const [unit, setUnit] = useState(initialData?.unit || 'units');
  const [quantity, setQuantity] = useState(initialData?.suggested_quantity || 100);
  const [reason, setReason] = useState(
    initialData?.reason ||
    'Urgent stock-out prevention: local stock critically low; nearby surplus requested to sustain daily outpatient dispensing.'
  );
  const [coldChainRequired, setColdChainRequired] = useState(Boolean(initialData?.cold_chain_flag));
  const [coldChainArranged, setColdChainArranged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialData) {
      if (initialData.source_phc_id) setSourcePhcId(initialData.source_phc_id);
      if (initialData.dest_phc_id) setDestPhcId(initialData.dest_phc_id);
      if (initialData.medicine_id) setMedicineId(initialData.medicine_id);
      if (initialData.medicine_name) setMedicineName(initialData.medicine_name);
      if (initialData.unit) setUnit(initialData.unit);
      if (initialData.suggested_quantity) setQuantity(initialData.suggested_quantity);
      if (initialData.cold_chain_flag !== undefined) setColdChainRequired(Boolean(initialData.cold_chain_flag));
    }
  }, [initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!sourcePhcId || !destPhcId || !medicineId || !quantity) {
      setError('Please fill in all required transfer fields.');
      return;
    }

    if (sourcePhcId === destPhcId) {
      setError('Source and Destination health centres cannot be the same.');
      return;
    }

    if (coldChainRequired && !coldChainArranged) {
      setError('Cold-chain handling confirmation is mandatory for vaccines and biologicals.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createTransfer({
        source_phc_id: sourcePhcId,
        dest_phc_id: destPhcId,
        medicine_id: medicineId,
        quantity: Number(quantity),
        reason,
        cold_chain_arranged: coldChainArranged,
        notes: `Created via MediSync Transfer Interface (${new Date().toLocaleDateString()})`
      });

      if (res.error) {
        setError(res.error);
      } else {
        if (onSuccess) onSuccess(res);
        onClose();
      }
    } catch (err) {
      setError('Failed to submit transfer request: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
              <Truck size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Initiate Inter-PHC Stock Transfer</h3>
              <p className="text-xs text-slate-500">Share surplus stock to prevent clinical stock-outs</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Medicine Name</label>
            <input
              type="text"
              readOnly
              value={`${medicineName} (${unit})`}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Destination (Shortage PHC)</label>
              <select
                value={destPhcId}
                onChange={(e) => setDestPhcId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 font-medium focus:border-teal-500 focus:outline-none"
              >
                {phcs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Source (Surplus PHC)</label>
              <select
                value={sourcePhcId}
                onChange={(e) => setSourcePhcId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 font-medium focus:border-teal-500 focus:outline-none"
              >
                <option value="">Select Donor PHC...</option>
                {phcs.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.block})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Quantity to Transfer ({unit})
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-bold text-slate-900 focus:border-teal-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Clinical Justification & Reason</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:border-teal-500 focus:outline-none"
              required
            />
          </div>

          {/* Mandatory Cold-chain checkbox if biological */}
          {coldChainRequired && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5">
              <div className="flex items-start gap-2.5">
                <input
                  id="cold-chain-check"
                  type="checkbox"
                  checked={coldChainArranged}
                  onChange={(e) => setColdChainArranged(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-blue-300 text-teal-600 focus:ring-teal-500"
                />
                <label htmlFor="cold-chain-check" className="text-xs text-blue-950">
                  <span className="font-bold">Cold-Chain Handling Arranged (Mandatory):</span>
                  <div className="text-[11px] text-blue-900/80 mt-0.5">
                    I confirm that a certified vaccine carrier box with conditioned ice-packs and temperature monitoring will be dispatched for this transfer (+2°C to +8°C).
                  </div>
                </label>
              </div>
            </div>
          )}

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
              className="rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-teal-700 shadow-sm transition disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Send Transfer Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
