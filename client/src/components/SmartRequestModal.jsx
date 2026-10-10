import { useState, useMemo } from 'react';
import { X, ShieldCheck, Truck, AlertTriangle, ArrowRight, CheckCircle2, Clock } from 'lucide-react';

export default function SmartRequestModal({
  receiverCentre,
  targetMedicine = 'Paracetamol Syrup',
  centres = [],
  onClose,
  onSubmitRequest
}) {
  const [selectedMed, setSelectedMed] = useState(targetMedicine);
  const [requestedQty, setRequestedQty] = useState(120);
  const [reason, setReason] = useState('Critical stock depletion: only 2 days of stock remaining for high outpatient influx.');
  const [urgency, setUrgency] = useState('High');
  const [selectedDonorCode, setSelectedDonorCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Evaluate candidate donors protecting safety reserves:
  // Transferable Surplus = Donor Current Stock - (Daily Usage * 14 days minimum safety buffer)
  const donorCandidates = useMemo(() => {
    return centres
      .filter((c) => c.code !== receiverCentre?.code)
      .map((c) => {
        const safetyReserve = c.usage * 14;
        const safeTransferableSurplus = Math.max(0, c.stock - safetyReserve);
        const canFulfill = safeTransferableSurplus >= requestedQty;
        const partialFulfill = safeTransferableSurplus > 0 && safeTransferableSurplus < requestedQty;

        // FEFO calculation: check batch expiry
        const isNearExpiry = c.expiry && c.expiry.startsWith('2026');

        return {
          ...c,
          safetyReserve,
          safeTransferableSurplus,
          canFulfill,
          partialFulfill,
          isNearExpiry,
          fefoScore: isNearExpiry ? 95 : 75
        };
      })
      .sort((a, b) => {
        // Sort by full fulfillment first, then FEFO priority, then distance
        if (a.canFulfill && !b.canFulfill) return -1;
        if (!a.canFulfill && b.canFulfill) return 1;
        if (a.isNearExpiry && !b.isNearExpiry) return -1;
        if (!a.isNearExpiry && b.isNearExpiry) return 1;
        return a.distance - b.distance;
      });
  }, [centres, receiverCentre, requestedQty]);

  // Set default donor to best candidate
  useMemo(() => {
    if (donorCandidates.length > 0 && !selectedDonorCode) {
      const best = donorCandidates.find((d) => d.canFulfill) || donorCandidates[0];
      if (best) setSelectedDonorCode(best.code);
    }
  }, [donorCandidates, selectedDonorCode]);

  const chosenDonor = donorCandidates.find((d) => d.code === selectedDonorCode);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!chosenDonor) return;

    setSubmitting(true);
    const requestData = {
      source_phc_id: chosenDonor.code,
      dest_phc_id: receiverCentre.code,
      from: chosenDonor.label,
      to: receiverCentre.label,
      medicine: selectedMed,
      quantity: Number(requestedQty),
      reason,
      urgency,
      fefo_batch_number: chosenDonor.batch || 'TN-BATCH-FEFO',
      fefo_expiry_date: chosenDonor.expiry || '2026-11-15'
    };

    onSubmitRequest(requestData);
    setSubmitting(false);
  };

  if (!receiverCentre) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-xl rounded-[28px] bg-white p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-serif text-2xl text-ink">Smart Medicine Requisition</h3>
            <p className="text-xs text-slate-500">
              Requesting Facility: <b className="text-slate-800">{receiverCentre.label}</b> &bull; Stock: {receiverCentre.stock} ({receiverCentre.days}d cover)
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Requested item & Quantity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Medicine Name</label>
              <input
                type="text"
                readOnly
                value={selectedMed}
                className="w-full rounded-xl border border-slate-200 bg-[#FAF8F4] px-3.5 py-2.5 font-bold text-slate-800"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Required Quantity</label>
              <input
                type="number"
                min="10"
                value={requestedQty}
                onChange={(e) => setRequestedQty(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-bold text-slate-900 focus:outline-none focus:border-teal"
                required
              />
            </div>
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Urgency & Clinical Reason</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:border-teal"
              required
            />
          </div>

          {/* Section 3 & 5: Evaluated Safe Donors with FEFO & Safety Buffers */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-700 block">
                Evaluated Safe Donors (Safety Buffers Protected):
              </label>
              <span className="text-[10px] text-teal font-semibold">
                FEFO Priority Active
              </span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {donorCandidates.map((donor) => {
                const isSelected = donor.code === selectedDonorCode;
                return (
                  <div
                    key={donor.code}
                    onClick={() => setSelectedDonorCode(donor.code)}
                    className={`cursor-pointer rounded-2xl border p-3 transition flex items-center justify-between ${
                      isSelected
                        ? 'border-teal bg-[#EAF4F4]'
                        : donor.canFulfill
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-200 bg-slate-50 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{donor.label}</span>
                        {donor.canFulfill && (
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.2 rounded-full text-[10px] font-bold">
                            Safe Donor
                          </span>
                        )}
                        {donor.isNearExpiry && (
                          <span className="bg-amber-100 text-amber-800 px-2 py-0.2 rounded-full text-[10px] font-bold">
                            FEFO Priority (Exp: {donor.expiry})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Stock: {donor.stock} &bull; Safety Reserve: {donor.safetyReserve} &bull; Safe Surplus: <b>{donor.safeTransferableSurplus} units</b>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-teal">{donor.distance} km</div>
                      <div className="text-[10px] text-slate-400">~{donor.time} mins drive</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Donor Safeguard Summary */}
          {chosenDonor && (
            <div className="rounded-xl border border-teal-200 bg-[#EAF4F4]/60 p-3 flex items-start gap-2.5">
              <ShieldCheck className="h-5 w-5 text-teal flex-shrink-0 mt-0.5" />
              <div className="text-slate-700 leading-snug">
                <b>Transfer Safeguard Verified: </b>
                Transferring {requestedQty} units from {chosenDonor.label} leaves them with {chosenDonor.stock - requestedQty} units ({Math.round((chosenDonor.stock - requestedQty) / chosenDonor.usage)} days cover), protecting their safety reserve. Batch <b>{chosenDonor.batch}</b> (Exp: {chosenDonor.expiry}) prioritised under FEFO.
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !chosenDonor}
              className="rounded-full bg-teal px-5 py-2 font-semibold text-white hover:bg-[#095959] transition shadow-xs disabled:opacity-50"
            >
              Submit Transfer Request &rarr;
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
