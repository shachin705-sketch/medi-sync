import { useState, useMemo } from 'react';
import { Sliders, ShieldCheck, AlertTriangle, ArrowRight, ArrowLeftRight, CheckCircle2, RotateCcw } from 'lucide-react';

export default function TransferSimulatorView({
  centres = [],
  medicineList = [],
  initialMedicine = 'Paracetamol Syrup',
  onInitiateTransfer
}) {
  const [selectedMed, setSelectedMed] = useState(initialMedicine);
  const [donorCode, setDonorCode] = useState('B'); // Default Centre B (Kelambakkam)
  const [receiverCode, setReceiverCode] = useState('A'); // Default Centre A (Thiruporur)
  const [transferQty, setTransferQty] = useState(120);

  const donorCentre = useMemo(() => {
    return centres.find((c) => c.code === donorCode) || centres[1] || centres[0];
  }, [centres, donorCode]);

  const receiverCentre = useMemo(() => {
    return centres.find((c) => c.code === receiverCode) || centres[0];
  }, [centres, receiverCode]);

  // Recalculate Simulation Metrics Live
  const simulation = useMemo(() => {
    const q = Number(transferQty);

    // Donor calculations
    const dStock = donorCentre.stock;
    const dUsage = donorCentre.usage || 8;
    const dDaysBefore = donorCentre.days;
    const dSafetyReserve = dUsage * 14; // 14-day protected reserve
    const dStockAfter = dStock - q;
    const dDaysAfter = Math.max(0, Math.round(dStockAfter / dUsage));
    const dRemainingSurplus = Math.max(0, dStockAfter - dSafetyReserve);
    const dSafetyPassed = dStockAfter >= dSafetyReserve;

    // Receiver calculations
    const rStock = receiverCentre.stock;
    const rUsage = receiverCentre.usage || 5;
    const rDaysBefore = receiverCentre.days;
    const rStockAfter = rStock + q;
    const rDaysAfter = Math.round(rStockAfter / rUsage);
    const rShortageRemaining = Math.max(0, (rUsage * 30) - rStockAfter);

    return {
      q,
      donor: {
        stockBefore: dStock,
        usage: dUsage,
        daysBefore: dDaysBefore,
        safetyReserve: dSafetyReserve,
        stockAfter: dStockAfter,
        daysAfter: dDaysAfter,
        remainingSurplus: dRemainingSurplus,
        safetyPassed: dSafetyPassed,
        safetyReason: dSafetyPassed
          ? `Donor retains safe buffer of ${dDaysAfter} days (${dStockAfter} units), strictly protecting the 14-day safety reserve (${dSafetyReserve} units).`
          : `UNSAFE PROPOSAL BLOCKED: Transfer of ${q} units would deplete donor to ${dDaysAfter} days (${dStockAfter} units), breaching the mandatory 14-day safety reserve (${dSafetyReserve} units).`
      },
      receiver: {
        stockBefore: rStock,
        usage: rUsage,
        daysBefore: rDaysBefore,
        stockAfter: rStockAfter,
        daysAfter: rDaysAfter,
        shortageRemaining: rShortageRemaining,
        riskBefore: rDaysBefore <= 2 ? 'Critical Shortage' : rDaysBefore <= 8 ? 'Low Stock Warning' : 'Healthy Stock',
        riskAfter: rDaysAfter <= 2 ? 'Critical Shortage' : rDaysAfter <= 8 ? 'Low Stock Warning' : 'Healthy Stock'
      }
    };
  }, [donorCentre, receiverCentre, transferQty]);

  return (
    <div className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
      {/* Header Banner */}
      <div className="border-b border-slate-100 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#2F6FDB] text-white">
              <Sliders size={16} />
            </span>
            <h2 className="font-serif text-2xl font-bold text-ink">Transfer Impact Simulator</h2>
            <span className="rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 uppercase tracking-wider">
              Sandbox Mode
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Interactively simulate before-and-after stock impacts for donor and receiver facilities. <b>Simulation never modifies actual database inventory.</b>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setDonorCode('B');
              setReceiverCode('A');
              setTransferQty(120);
            }}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#FAF8F4] px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
          >
            <RotateCcw size={13} /> Reset Scenario
          </button>
        </div>
      </div>

      {/* Simulator Controls Card */}
      <div className="rounded-2xl border border-slate-200 bg-[#FAF8F4] p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Medicine Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Tracked Medicine:</label>
            <select
              value={selectedMed}
              onChange={(e) => setSelectedMed(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-teal"
            >
              {medicineList.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Donor Facility Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Donor Facility (Potential Surplus):</label>
            <select
              value={donorCode}
              onChange={(e) => setDonorCode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-emerald-800 focus:outline-none focus:border-teal"
            >
              {centres.map((c) => (
                <option key={c.code} value={c.code} disabled={c.code === receiverCode}>
                  {c.label} &bull; Stock: {c.stock} ({c.days}d)
                </option>
              ))}
            </select>
          </div>

          {/* Receiver Facility Selector */}
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1.5">Receiving Facility (Shortage):</label>
            <select
              value={receiverCode}
              onChange={(e) => setReceiverCode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-red-800 focus:outline-none focus:border-teal"
            >
              {centres.map((c) => (
                <option key={c.code} value={c.code} disabled={c.code === donorCode}>
                  {c.label} &bull; Stock: {c.stock} ({c.days}d)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Transfer Quantity Slider & Presets */}
        <div className="pt-2 border-t border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800">
              Proposed Transfer Quantity: <span className="text-base font-black text-[#2F6FDB] ml-1">{transferQty} units</span>
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-500 font-semibold mr-1">Presets:</span>
              {[20, 30, 50, 100, 120, 150].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setTransferQty(preset)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                    transferQty === preset
                      ? 'bg-[#2F6FDB] text-white shadow-xs'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <input
            type="range"
            min="10"
            max="300"
            step="5"
            value={transferQty}
            onChange={(e) => setTransferQty(Number(e.target.value))}
            className="w-full accent-[#2F6FDB] cursor-pointer"
          />
        </div>
      </div>

      {/* SIDE-BY-SIDE IMPACT PANELS (Mandatory Requirement) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* =================================================================== */}
        {/* PANEL 1: DONOR CENTRE (Centre B Kelambakkam)                        */}
        {/* =================================================================== */}
        <div className={`rounded-2xl border p-5 space-y-4 transition ${
          simulation.donor.safetyPassed ? 'border-emerald-200 bg-emerald-50/20' : 'border-red-300 bg-red-50/30'
        }`}>
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Donor Facility</span>
              <h3 className="font-serif text-lg font-bold text-slate-900">{donorCentre.label}</h3>
              <p className="text-[11px] text-slate-500">{donorCentre.type} &bull; Code: {donorCentre.code}</p>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
              simulation.donor.safetyPassed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
            }`}>
              {simulation.donor.safetyPassed ? 'Safe Donor' : 'Reserve Breached'}
            </span>
          </div>

          {/* Donor Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Current Usable Stock:</span>
              <span className="font-black text-slate-900 text-base">{simulation.donor.stockBefore}</span>
              <span className="text-slate-400 text-[10px] ml-1">units</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Average Daily Usage:</span>
              <span className="font-black text-slate-900 text-base">{simulation.donor.usage}</span>
              <span className="text-slate-400 text-[10px] ml-1">units/day</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Current Days Cover:</span>
              <span className="font-black text-emerald-700 text-base">{simulation.donor.daysBefore}</span>
              <span className="text-slate-400 text-[10px] ml-1">days</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">14d Safety Reserve:</span>
              <span className="font-black text-slate-700 text-base">{simulation.donor.safetyReserve}</span>
              <span className="text-slate-400 text-[10px] ml-1">units</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Stock After Dispatch:</span>
              <span className={`font-black text-base ${simulation.donor.safetyPassed ? 'text-slate-900' : 'text-red-600'}`}>
                {simulation.donor.stockAfter}
              </span>
              <span className="text-slate-400 text-[10px] ml-1">units</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Days Cover After:</span>
              <span className={`font-black text-base ${simulation.donor.safetyPassed ? 'text-emerald-700' : 'text-red-600'}`}>
                {simulation.donor.daysAfter}
              </span>
              <span className="text-slate-400 text-[10px] ml-1">days</span>
            </div>
          </div>

          {/* Visual Progress Bar: Before vs After */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-[11px] font-semibold text-slate-600">
              <span>Stock Retention Ratio:</span>
              <span>{Math.max(0, Math.round((simulation.donor.stockAfter / simulation.donor.stockBefore) * 100))}% remaining</span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all duration-300 ${simulation.donor.safetyPassed ? 'bg-emerald-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, Math.max(0, (simulation.donor.stockAfter / simulation.donor.stockBefore) * 100))}%` }}
              />
            </div>
          </div>

          {/* Batch & Safety Reason */}
          <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
            simulation.donor.safetyPassed ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-red-50 border-red-200 text-red-950'
          }`}>
            {simulation.donor.safetyPassed ? (
              <ShieldCheck size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
            )}
            <div className="leading-snug">
              <b>{simulation.donor.safetyPassed ? 'Safety Buffer Protected:' : 'Safety Check Failed:'} </b>
              {simulation.donor.safetyReason}
              <div className="font-mono text-[11px] mt-1 text-slate-600">
                FEFO Batch: <b>{donorCentre.batch}</b> (Exp: {donorCentre.expiry})
              </div>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* PANEL 2: RECEIVING CENTRE (Centre A Thiruporur)                     */}
        {/* =================================================================== */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/20 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Receiving Facility</span>
              <h3 className="font-serif text-lg font-bold text-slate-900">{receiverCentre.label}</h3>
              <p className="text-[11px] text-slate-500">{receiverCentre.type} &bull; Code: {receiverCentre.code}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                Before: {simulation.receiver.riskBefore}
              </span>
              <ArrowRight size={13} className="text-slate-400" />
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                After: {simulation.receiver.riskAfter}
              </span>
            </div>
          </div>

          {/* Receiver Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Current Usable Stock:</span>
              <span className="font-black text-red-600 text-base">{simulation.receiver.stockBefore}</span>
              <span className="text-slate-400 text-[10px] ml-1">units</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Average Daily Usage:</span>
              <span className="font-black text-slate-900 text-base">{simulation.receiver.usage}</span>
              <span className="text-slate-400 text-[10px] ml-1">units/day</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Current Days Cover:</span>
              <span className="font-black text-red-600 text-base">{simulation.receiver.daysBefore}</span>
              <span className="text-slate-400 text-[10px] ml-1">days (Critical)</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Proposed to Receive:</span>
              <span className="font-black text-[#2F6FDB] text-base">+{simulation.q}</span>
              <span className="text-slate-400 text-[10px] ml-1">units</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Projected Stock After:</span>
              <span className="font-black text-emerald-700 text-base">{simulation.receiver.stockAfter}</span>
              <span className="text-slate-400 text-[10px] ml-1">units</span>
            </div>

            <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs">
              <span className="text-slate-500 block text-[10px]">Projected Days After:</span>
              <span className="font-black text-emerald-700 text-base">{simulation.receiver.daysAfter}</span>
              <span className="text-slate-400 text-[10px] ml-1">days (Safe)</span>
            </div>
          </div>

          {/* Visual Progress Bar: Stockout Elimination */}
          <div className="space-y-1 text-xs">
            <div className="flex justify-between text-[11px] font-semibold text-slate-600">
              <span>Shortage Resolution Progress:</span>
              <span>{simulation.receiver.daysAfter >= 14 ? '100% Buffer Achieved' : `${Math.round((simulation.receiver.daysAfter / 14) * 100)}%`}</span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${Math.min(100, Math.round((simulation.receiver.daysAfter / 30) * 100))}%` }}
              />
            </div>
          </div>

          {/* Impact Outcome Summary */}
          <div className="p-3 rounded-xl border border-blue-200 bg-blue-50 text-blue-950 text-xs flex items-start gap-2">
            <CheckCircle2 size={18} className="text-[#2F6FDB] flex-shrink-0 mt-0.5" />
            <div className="leading-snug">
              <b>Stockout Eliminated: </b>
              Receiving {simulation.q} units expands {receiverCentre.label}'s clinical runway from <b>{simulation.receiver.daysBefore} days to {simulation.receiver.daysAfter} days</b>, preventing stock-outs for outpatient care.
            </div>
          </div>
        </div>
      </div>

      {/* Action CTA Bar */}
      <div className="p-4 rounded-2xl bg-[#FAF8F4] border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="text-slate-600 leading-snug">
          <b>Ready to execute? </b>
          {simulation.donor.safetyPassed ? (
            <span className="text-emerald-700 font-semibold">
              This simulated transfer satisfies all safety reserve policies and is eligible for submission.
            </span>
          ) : (
            <span className="text-red-700 font-semibold">
              Notice: Proposal exceeds donor safe surplus. Adjust quantity before submitting.
            </span>
          )}
        </div>

        <button
          onClick={() => {
            if (onInitiateTransfer) {
              onInitiateTransfer({
                donor: donorCentre,
                receiver: receiverCentre,
                medicine: selectedMed,
                quantity: transferQty
              });
            }
          }}
          disabled={!simulation.donor.safetyPassed}
          className="rounded-full bg-[#0B6E6E] px-6 py-2.5 font-bold text-white hover:bg-[#095959] transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          Submit Transfer for Approval &rarr;
        </button>
      </div>
    </div>
  );
}
