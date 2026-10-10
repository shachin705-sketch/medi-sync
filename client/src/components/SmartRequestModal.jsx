import { useState, useMemo } from 'react';
import { X, ShieldCheck, Truck, AlertTriangle, ArrowRight, CheckCircle2, Clock, Building2, AlertCircle } from 'lucide-react';

const WAREHOUSE_MAPPING = {
  Madurai: {
    id: 'wh-madurai',
    code: 'DDW-MDU',
    name: 'Madurai District Drug Warehouse',
    label: 'Madurai District Drug Warehouse (Simulated)',
    district: 'Madurai',
    stock: 2120,
    usage: 0,
    distance: 12.5,
    time: 25,
    is_warehouse: true
  },
  Theni: {
    id: 'wh-theni',
    code: 'DDW-THN',
    name: 'Theni District Drug Warehouse',
    label: 'Theni District Drug Warehouse (Simulated)',
    district: 'Theni',
    stock: 2072,
    usage: 0,
    distance: 14.0,
    time: 30,
    is_warehouse: true
  },
  Dindigul: {
    id: 'wh-dindigul',
    code: 'DDW-DGL',
    name: 'Dindigul District Drug Warehouse',
    label: 'Dindigul District Drug Warehouse (Simulated)',
    district: 'Dindigul',
    stock: 2258,
    usage: 0,
    distance: 15.0,
    time: 28,
    is_warehouse: true
  }
};

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
  const [isEscalatedToWarehouse, setIsEscalatedToWarehouse] = useState(false);

  const receiverDistrict = receiverCentre?.district || 'Madurai';
  const districtWarehouse = WAREHOUSE_MAPPING[receiverDistrict] || WAREHOUSE_MAPPING['Madurai'];

  // Section 5: Donor ranking:
  // Same-district peer centres first, then other districts, then district warehouse, then escalate.
  const donorCandidates = useMemo(() => {
    // 1. Peer centres
    const evaluatedPeers = centres
      .filter((c) => c.code !== receiverCentre?.code)
      .map((c) => {
        const safetyReserve = (c.usage || 5) * 14;
        const safeTransferableSurplus = Math.max(0, (c.stock || 0) - safetyReserve);
        const canFulfill = safeTransferableSurplus >= requestedQty;
        const partialFulfill = safeTransferableSurplus > 0 && safeTransferableSurplus < requestedQty;
        const isSameDistrict = c.district === receiverDistrict;
        const isNearExpiry = c.expiry && c.expiry.startsWith('2026');

        return {
          ...c,
          safetyReserve,
          safeTransferableSurplus,
          canFulfill,
          partialFulfill,
          isSameDistrict,
          isNearExpiry,
          fefoScore: isNearExpiry ? 95 : 75,
          is_warehouse: false
        };
      });

    // 2. Add District Warehouse option
    const evaluatedWarehouse = {
      ...districtWarehouse,
      safetyReserve: 0,
      safeTransferableSurplus: districtWarehouse.stock,
      canFulfill: districtWarehouse.stock >= requestedQty,
      partialFulfill: false,
      isSameDistrict: true,
      isNearExpiry: false,
      fefoScore: 50,
      is_warehouse: true
    };

    const allCandidates = [...evaluatedPeers, evaluatedWarehouse];

    return allCandidates.sort((a, b) => {
      // Warehouses ranked after peers
      if (a.is_warehouse && !b.is_warehouse) return 1;
      if (!a.is_warehouse && b.is_warehouse) return -1;

      // Same-district peer centres first
      if (a.isSameDistrict && !b.isSameDistrict) return -1;
      if (!a.isSameDistrict && b.isSameDistrict) return 1;

      // Fulfillment capacity
      if (a.canFulfill && !b.canFulfill) return -1;
      if (!a.canFulfill && b.canFulfill) return 1;

      // FEFO near expiry priority
      if (a.isNearExpiry && !b.isNearExpiry) return -1;
      if (!a.isNearExpiry && b.isNearExpiry) return 1;

      return (a.distance || 99) - (b.distance || 99);
    });
  }, [centres, receiverCentre, receiverDistrict, districtWarehouse, requestedQty]);

  // Set default donor to best candidate
  useMemo(() => {
    if (donorCandidates.length > 0 && !selectedDonorCode) {
      const best = donorCandidates.find((d) => d.canFulfill && !d.is_warehouse) || donorCandidates[0];
      if (best) {
        setSelectedDonorCode(best.code);
        setIsEscalatedToWarehouse(Boolean(best.is_warehouse));
      }
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
      is_escalation: Boolean(chosenDonor.is_warehouse),
      is_cross_district: chosenDonor.district !== receiverDistrict,
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
              Requesting Facility: <b className="text-slate-800">{receiverCentre.label}</b> ({receiverDistrict} District) &bull; Stock: {receiverCentre.stock} ({receiverCentre.days}d cover)
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 cursor-pointer">
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
            <label className="font-bold text-slate-700 block mb-1">Clinical Reason &amp; Urgency</label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:border-teal"
              required
            />
          </div>

          {/* Section 5: Evaluated Donors Ranking */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="font-bold text-slate-700 block">
                Ranked Donor Facilities (Same-District First &bull; Safety Reserves Protected):
              </label>
              <span className="text-[10px] text-teal font-semibold">
                FEFO &amp; District Priority Active
              </span>
            </div>

            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {donorCandidates.map((donor) => {
                const isSelected = donor.code === selectedDonorCode;
                const isCrossDistrict = donor.district !== receiverDistrict && !donor.is_warehouse;

                return (
                  <div
                    key={donor.code}
                    onClick={() => {
                      setSelectedDonorCode(donor.code);
                      setIsEscalatedToWarehouse(Boolean(donor.is_warehouse));
                    }}
                    className={`cursor-pointer rounded-2xl border p-3 transition flex items-center justify-between ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 shadow-2xs'
                        : donor.canFulfill
                        ? 'border-slate-200 bg-white hover:border-slate-300'
                        : 'border-slate-200 bg-slate-50 opacity-60'
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-slate-900">{donor.label}</span>
                        {donor.is_warehouse ? (
                          <span className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            District Warehouse (Escalation)
                          </span>
                        ) : donor.isSameDistrict ? (
                          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            Same District ({donor.district})
                          </span>
                        ) : (
                          <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            Cross-District ({donor.district}) - Extra Approval
                          </span>
                        )}

                        {donor.isNearExpiry && (
                          <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full text-[9px] font-bold">
                            FEFO Priority (Exp: {donor.expiry})
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-slate-500 mt-1">
                        {donor.is_warehouse ? (
                          <span>District Reserve: <b>{donor.stock} units available</b> &bull; Central Depot</span>
                        ) : (
                          <span>
                            Stock: {donor.stock} &bull; Safety Reserve: {donor.safetyReserve} &bull; Safe Surplus: <b>{donor.safeTransferableSurplus} units</b>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-3">
                      <div className="font-bold text-blue-600">~{donor.distance} km</div>
                      <div className="text-[10px] text-slate-400">~{donor.time} min road</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cross-District / Escalation Notice (Section 5) */}
          {chosenDonor && chosenDonor.district !== receiverDistrict && !chosenDonor.is_warehouse && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 flex items-start gap-2 text-amber-900">
              <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <b>Cross-District Transfer Notice: </b>
                This transfer moves stock from <b>{chosenDonor.district}</b> to <b>{receiverDistrict}</b>. Cross-district transfers are flagged for higher-level District Officer approval per regulatory protocol.
              </div>
            </div>
          )}

          {chosenDonor && chosenDonor.is_warehouse && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 p-2.5 flex items-start gap-2 text-indigo-950">
              <Building2 size={15} className="text-indigo-600 shrink-0 mt-0.5" />
              <div>
                <b>District Warehouse Escalation: </b>
                This requisition creates a direct district emergency indent to <b>{chosenDonor.name}</b> for {requestedQty} units. Warehouse dispatches directly to the facility.
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setSelectedDonorCode(districtWarehouse.code);
                setIsEscalatedToWarehouse(true);
              }}
              className="text-indigo-700 hover:text-indigo-900 text-xs font-bold underline cursor-pointer"
            >
              Escalate to {receiverDistrict} Warehouse &rarr;
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !chosenDonor}
                className="rounded-full bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {chosenDonor?.is_warehouse ? 'Submit District Escalation' : 'Submit Transfer Request'} &rarr;
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
