import { useState, useEffect, useMemo } from 'react';
import {
  X, Check, AlertTriangle, ShieldCheck, Clock, FileText, ArrowRight,
  Printer, RefreshCw, AlertCircle, CheckCircle, RotateCcw, XCircle, Search
} from 'lucide-react';
import { api } from '../utils/api';

export default function MedicineBillingModal({
  isOpen,
  onClose,
  centres = [],
  medicines = [],
  initialCentreCode = null,
  initialMedicine = null,
  onDispenseSuccess
}) {
  const [selectedCentre, setSelectedCentre] = useState('');
  const [selectedMedicineName, setSelectedMedicineName] = useState('Paracetamol Syrup');
  const [prescribedQuantity, setPrescribedQuantity] = useState('10');
  const [patientDemoId, setPatientDemoId] = useState(`OPD-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [prescribedBy, setPrescribedBy] = useState('Dr. S. Kaviya (Medical Officer)');
  const [recordedBy, setRecordedBy] = useState('Thiru. Murugan (Pharmacist)');
  const [notes, setNotes] = useState('Outpatient clinical dispensation');

  // Preview & Bill states
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [currentBill, setCurrentBill] = useState(null);
  const [isSubmittingDraft, setIsSubmittingDraft] = useState(false);
  const [isConfirmingDispense, setIsConfirmingDispense] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [showReversalPrompt, setShowReversalPrompt] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [receiptView, setReceiptView] = useState(false);

  // Sync initial centre and medicine
  useEffect(() => {
    if (initialCentreCode && centres.length > 0) {
      const match = centres.find((c) => c.code === initialCentreCode || c.id === initialCentreCode);
      if (match) {
        setSelectedCentre(match.id || match.code);
      } else {
        setSelectedCentre(centres[0].id || centres[0].code);
      }
    } else if (centres.length > 0 && !selectedCentre) {
      setSelectedCentre(centres[0].id || centres[0].code);
    }

    if (initialMedicine) {
      setSelectedMedicineName(initialMedicine);
    }
  }, [initialCentreCode, initialMedicine, centres]);

  // Map medicine name to medicine_id
  const medicineIdMap = useMemo(() => {
    return {
      'Paracetamol Syrup': 'med-pcm-syp',
      'ORS Sachets': 'med-ors',
      'Amoxicillin Suspension': 'med-amx-syp',
      'Iron-Folic Acid': 'med-ifa-tab',
      'Metformin 500mg': 'med-met-500',
      'Anti-Snake Venom (ASV)': 'med-asv-vial'
    };
  }, []);

  const activeMedId = useMemo(() => {
    return medicineIdMap[selectedMedicineName] || 'med-pcm-syp';
  }, [selectedMedicineName, medicineIdMap]);

  // Fetch FEFO preview when centre, medicine, or quantity changes
  useEffect(() => {
    if (!isOpen || !selectedCentre || !activeMedId) return;
    const qty = Number(prescribedQuantity);
    if (!qty || qty <= 0) {
      setPreviewData(null);
      return;
    }

    let isMounted = true;
    setPreviewLoading(true);
    setErrorMessage(null);

    api.previewBillingFefo({
      phc_id: selectedCentre,
      medicine_id: activeMedId,
      requested_quantity: qty
    }).then((res) => {
      if (isMounted) {
        if (res.error) {
          setPreviewData(null);
          setErrorMessage(res.error);
        } else {
          setPreviewData(res);
          setErrorMessage(null);
        }
        setPreviewLoading(false);
      }
    }).catch((err) => {
      if (isMounted) {
        setPreviewData(null);
        setErrorMessage(err.message);
        setPreviewLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, selectedCentre, activeMedId, prescribedQuantity]);

  if (!isOpen) return null;

  // Handler: Generate Draft Bill (CRITICAL RULE: DOES NOT DEDUCT STOCK)
  const handleGenerateDraft = async () => {
    setErrorMessage(null);
    setIsSubmittingDraft(true);

    try {
      const res = await api.createDraftBill({
        phc_id: selectedCentre,
        medicine_id: activeMedId,
        prescribed_quantity: Number(prescribedQuantity),
        patient_demo_id: patientDemoId,
        prescribed_by: prescribedBy,
        recorded_by: recordedBy,
        notes
      });

      if (res.error) {
        throw new Error(res.error);
      }

      setCurrentBill(res.bill);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to create draft bill');
    } finally {
      setIsSubmittingDraft(false);
    }
  };

  // Handler: Confirm Actual Dispense (Atomically deducts stock with idempotency protection)
  const handleConfirmDispense = async () => {
    if (!currentBill) return;
    setErrorMessage(null);
    setIsConfirmingDispense(true);

    try {
      const idempotencyKey = `idem-${currentBill.id}-${Date.now()}`;
      const res = await api.confirmBillDispense(currentBill.id, {
        confirmed_by: recordedBy,
        idempotency_key: idempotencyKey
      });

      if (res.error) {
        throw new Error(res.error);
      }

      setCurrentBill(res.bill);
      setReceiptView(true);

      if (onDispenseSuccess) {
        onDispenseSuccess(res.bill);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to confirm medicine dispensing');
    } finally {
      setIsConfirmingDispense(false);
    }
  };

  // Handler: Cancel Draft Bill
  const handleCancelDraft = async () => {
    if (!currentBill) return;
    setErrorMessage(null);

    try {
      const res = await api.cancelBill(currentBill.id, {
        reason: 'Cancelled by pharmacist',
        cancelled_by: recordedBy
      });

      if (res.error) throw new Error(res.error);
      setCurrentBill(res.bill);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to cancel bill');
    }
  };

  // Handler: Reverse Dispensed Bill (Auditable Stock Return)
  const handleReverseDispense = async () => {
    if (!currentBill) return;
    if (!reversalReason.trim()) {
      setErrorMessage('Please state an audit reason for dispensing reversal / stock return');
      return;
    }

    setErrorMessage(null);
    try {
      const res = await api.reverseBill(currentBill.id, {
        reason: reversalReason,
        recorded_by: recordedBy
      });

      if (res.error) throw new Error(res.error);
      setCurrentBill(res.bill);
      setShowReversalPrompt(false);

      if (onDispenseSuccess) {
        onDispenseSuccess(res.bill);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to reverse bill');
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const resetForm = () => {
    setCurrentBill(null);
    setReceiptView(false);
    setPatientDemoId(`OPD-2026-${Math.floor(1000 + Math.random() * 9000)}`);
    setPrescribedQuantity('10');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header Bar */}
        <div className="bg-[#14213D] text-white px-6 py-5 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#2F6FDB] flex items-center justify-center text-white shadow-md">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold">Medicine Issue &amp; Billing</h2>
              <p className="text-xs text-slate-300">
                FEFO Batch Allocation &bull; Draft &rarr; Confirmed Dispensing &bull; Auditable Stock Ledger
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Mode 1: Receipt / Confirmation Slip View */}
          {receiptView && currentBill ? (
            <div className="space-y-5 print:p-0">
              <div className="text-center pb-3 border-b border-slate-200">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold mb-2">
                  <CheckCircle size={14} />
                  <span>Dispensing Completed &bull; Stock Deducted</span>
                </div>
                <h3 className="font-serif text-2xl font-bold text-slate-900">
                  Dispensation Receipt &amp; Voucher
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Ref: <span className="font-bold text-slate-800">{currentBill.bill_number}</span> &bull; {currentBill.confirmed_at || new Date().toLocaleString()}
                </p>
              </div>

              {/* Receipt Grid */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Facility</span>
                    <span className="font-bold text-slate-900">{currentBill.centre_name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Patient Demo ID</span>
                    <span className="font-mono font-bold text-slate-800">{currentBill.patient_demo_id}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Prescribed By</span>
                    <span className="font-semibold text-slate-700">{currentBill.prescribed_by || 'Medical Officer'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Dispensed By</span>
                    <span className="font-semibold text-slate-700">{currentBill.confirmed_by || recordedBy}</span>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3">
                  <div className="font-bold text-slate-800 mb-2">Dispensed Medicine &amp; Batch Allocation Breakdown:</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <thead className="bg-[#FAF8F4] text-slate-600 font-bold uppercase text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Medicine</th>
                          <th className="py-2 px-3">Batch Number</th>
                          <th className="py-2 px-3">Expiry Date</th>
                          <th className="py-2 px-3 text-right">Prescribed</th>
                          <th className="py-2 px-3 text-right">Dispensed</th>
                          <th className="py-2 px-3 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentBill.items?.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-2.5 px-3 font-bold text-slate-800">{item.medicine_name}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-[#0B6E6E]">
                              {item.batch_allocations?.map((b) => b.batch_number).join(', ') || 'TN-BATCH-STD'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {item.batch_allocations?.map((b) => b.expiry_date).join(', ') || '2027-12-31'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium">{item.prescribed_quantity} {item.unit}</td>
                            <td className="py-2.5 px-3 text-right font-black text-emerald-600">{item.dispensed_quantity} {item.unit}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700 uppercase text-[10px]">{item.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-[11px] text-slate-500">
                  <div>
                    Status: <span className="font-bold text-emerald-700">{currentBill.status}</span>
                  </div>
                  <div>
                    Idempotency Key: <span className="font-mono text-slate-400">{currentBill.idempotency_key || 'Verified Single-Write'}</span>
                  </div>
                </div>
              </div>

              {/* Reversal Prompt Modal Area */}
              {showReversalPrompt ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 space-y-3">
                  <div className="font-bold text-amber-900 flex items-center gap-2">
                    <RotateCcw size={16} />
                    <span>Auditable Return / Reversal Workflow</span>
                  </div>
                  <p className="text-xs text-amber-800">
                    Reversing this transaction will restore the dispensed medicine back into batch inventory and create an auditable reversal movement in the stock ledger.
                  </p>
                  <div>
                    <label className="block text-[11px] font-bold text-amber-900 mb-1">
                      Reason for Reversal / Return <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={reversalReason}
                      onChange={(e) => setReversalReason(e.target.value)}
                      placeholder="e.g. Prescription dose revised by MO / Patient returned medication"
                      className="w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      onClick={() => setShowReversalPrompt(false)}
                      className="px-3 py-1.5 rounded-full border border-slate-200 text-xs text-slate-600 hover:bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleReverseDispense}
                      className="px-4 py-1.5 rounded-full bg-[#D62839] text-white text-xs font-bold hover:bg-red-700"
                    >
                      Confirm Reversal &amp; Return Stock
                    </button>
                  </div>
                </div>
              ) : currentBill.status === 'Reversed' ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center justify-between">
                  <div>
                    <b>TRANSACTION REVERSED:</b> {currentBill.reversal_reason || 'Dispensing reversed'}. Stock was returned to inventory.
                  </div>
                  <span className="text-[10px] font-mono text-red-500">{currentBill.reversed_at}</span>
                </div>
              ) : null}

              {/* Receipt Footer Action Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-200 print:hidden">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                  >
                    <Printer size={14} />
                    <span>Print Receipt</span>
                  </button>
                  {currentBill.status !== 'Reversed' && !showReversalPrompt && (
                    <button
                      onClick={() => setShowReversalPrompt(true)}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50"
                    >
                      <RotateCcw size={14} />
                      <span>Reverse / Return</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={resetForm}
                    className="px-4 py-1.5 rounded-full bg-[#0B6E6E] text-white text-xs font-bold hover:bg-[#095959]"
                  >
                    Issue Another Medicine &rarr;
                  </button>
                  <button
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-full border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Mode 2: Dispensing Workflow (Steps 1 to 7) */
            <div className="space-y-4">
              {/* Step 1 & 2: Facility and Medicine Select */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    1. Healthcare Centre <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedCentre}
                    onChange={(e) => setSelectedCentre(e.target.value)}
                    disabled={Boolean(currentBill)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0B6E6E] focus:outline-none disabled:bg-slate-100"
                  >
                    {centres.map((c) => (
                      <option key={c.id || c.code} value={c.id || c.code}>
                        {c.name || c.label} ({c.code || c.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    2. Medicine Prescribed <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedMedicineName}
                    onChange={(e) => setSelectedMedicineName(e.target.value)}
                    disabled={Boolean(currentBill)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0B6E6E] focus:outline-none disabled:bg-slate-100"
                  >
                    {[
                      'Paracetamol Syrup',
                      'ORS Sachets',
                      'Amoxicillin Suspension',
                      'Iron-Folic Acid',
                      'Metformin 500mg',
                      'Anti-Snake Venom (ASV)'
                    ].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Step 3: Prescribed Quantity & Patient Demo ID */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    3. Prescribed Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={prescribedQuantity}
                    onChange={(e) => setPrescribedQuantity(e.target.value)}
                    disabled={Boolean(currentBill)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-[#0B6E6E] focus:outline-none disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Patient Demo ID
                  </label>
                  <input
                    type="text"
                    value={patientDemoId}
                    onChange={(e) => setPatientDemoId(e.target.value)}
                    disabled={Boolean(currentBill)}
                    placeholder="OPD-2026-XXXX"
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-slate-800 focus:outline-none disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Recorded By (Pharmacist)
                  </label>
                  <input
                    type="text"
                    value={recordedBy}
                    onChange={(e) => setRecordedBy(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:outline-none"
                  />
                </div>
              </div>

              {/* Step 4 & 5: Live FEFO Batch Allocation Preview */}
              <div className="rounded-2xl border border-slate-200 bg-[#FAF8F4] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-[#0B6E6E]" />
                    <span>Step 4 &amp; 5: FEFO Batch Selection Preview</span>
                  </div>
                  {previewLoading && (
                    <span className="text-[10px] text-slate-500 flex items-center gap-1">
                      <RefreshCw size={12} className="animate-spin" />
                      Checking batches...
                    </span>
                  )}
                </div>

                {previewData ? (
                  <div className="space-y-3 text-xs">
                    {/* Allocation summary row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white rounded-xl p-3 border border-slate-200">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Available Total</span>
                        <span className="font-extrabold text-slate-900">{previewData.total_available_stock} units</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Can Dispense</span>
                        <span className="font-black text-emerald-600">{previewData.allocated_total} units</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Unfulfilled Qty</span>
                        <span className={`font-bold ${previewData.remaining_unfulfilled > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                          {previewData.remaining_unfulfilled} units
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Projected Balance</span>
                        <span className="font-black text-slate-800">
                          {Math.max(0, previewData.total_available_stock - previewData.allocated_total)} units
                        </span>
                      </div>
                    </div>

                    {/* Partial Dispensing Notice */}
                    {previewData.is_partial && (
                      <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-[11px] text-amber-900 flex items-center gap-2">
                        <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
                        <span>
                          <b>Partial Dispensing Notice:</b> Prescribed {previewData.requested_quantity} units, but only {previewData.allocated_total} units are eligible in stock. Actual dispensed and remaining shortfall ({previewData.remaining_unfulfilled} units) will be tracked separately.
                        </span>
                      </div>
                    )}

                    {/* Near Expiry Batch Warning */}
                    {previewData.near_expiry_warning && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-2.5 text-[11px] text-amber-900 flex items-center gap-2">
                        <Clock size={14} className="text-amber-600 flex-shrink-0" />
                        <span>
                          <b>FEFO Near-Expiry Alert:</b> Earliest-expiring batch is within 90 days of expiry. Prioritized for dispensing under Tamil Nadu FEFO guidelines.
                        </span>
                      </div>
                    )}

                    {/* Batch Allocations Table */}
                    <div>
                      <div className="text-[11px] font-bold text-slate-700 mb-1.5">
                        Selected Batches (Earliest Expiry First):
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs bg-white rounded-xl border border-slate-200">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px]">
                            <tr>
                              <th className="py-2 px-3">Batch Number</th>
                              <th className="py-2 px-3">Expiry Date</th>
                              <th className="py-2 px-3">Days Left</th>
                              <th className="py-2 px-3 text-right">Batch Stock</th>
                              <th className="py-2 px-3 text-right">Deduction</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {previewData.allocations.map((a, idx) => (
                              <tr key={idx}>
                                <td className="py-2 px-3 font-mono font-bold text-[#0B6E6E]">{a.batch_number}</td>
                                <td className="py-2 px-3 text-slate-700">{a.expiry_date}</td>
                                <td className="py-2 px-3">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    a.days_to_expiry <= 90 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                                  }`}>
                                    {a.days_to_expiry} days
                                  </span>
                                </td>
                                <td className="py-2 px-3 text-right text-slate-500">{a.available_in_batch}</td>
                                <td className="py-2 px-3 text-right font-black text-emerald-600">-{a.allocated_quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 py-3 text-center">
                    Enter quantity and select medicine to calculate FEFO batch allocation.
                  </div>
                )}
              </div>

              {/* Draft Status & Confirmation Summary Area */}
              {currentBill ? (
                <div className="rounded-2xl border-2 border-[#2F6FDB] bg-blue-50/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-ping"></span>
                      <span className="font-serif text-sm font-bold text-slate-900">
                        Draft Bill Generated: <span className="font-mono text-[#2F6FDB]">{currentBill.bill_number}</span>
                      </span>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold uppercase">
                      Status: {currentBill.status}
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 bg-white rounded-xl p-3 border border-blue-200 grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock Before Issue</span>
                      <span className="font-bold text-slate-800">{currentBill.stock_before} {currentBill.unit}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">To Dispense Now</span>
                      <span className="font-black text-emerald-600">-{currentBill.can_dispense_quantity} {currentBill.unit}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Stock Remaining After</span>
                      <span className="font-black text-slate-900">{currentBill.stock_after_projected} {currentBill.unit}</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-[#0B6E6E]" />
                    <span><b>Important Billing Rule:</b> Stock is currently <b>NOT</b> deducted. Deductions occur only upon clicking Confirm Dispense below.</span>
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-blue-200">
                    <button
                      type="button"
                      onClick={handleCancelDraft}
                      className="px-3.5 py-1.5 rounded-full border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100"
                    >
                      Cancel Draft
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDispense}
                      disabled={isConfirmingDispense}
                      className="px-6 py-2 rounded-full bg-[#2F6FDB] text-white text-xs font-bold hover:bg-[#255ec4] transition shadow-md disabled:opacity-50 flex items-center gap-2"
                    >
                      {isConfirmingDispense ? 'Processing Dispense...' : 'Confirm Dispensing & Deduct Stock &rarr;'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Generate Draft Button */
                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateDraft}
                    disabled={isSubmittingDraft || !previewData || previewData.allocated_total === 0}
                    className="px-6 py-2 rounded-full bg-[#0B6E6E] text-white text-xs font-bold hover:bg-[#095959] transition shadow-xs disabled:opacity-50 flex items-center gap-2"
                  >
                    {isSubmittingDraft ? 'Generating Draft...' : 'Generate Draft Bill & Preview &rarr;'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
