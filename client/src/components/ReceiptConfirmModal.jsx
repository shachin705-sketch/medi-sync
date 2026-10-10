import { useState } from 'react';
import { X, CheckCircle2, Printer, ShieldCheck } from 'lucide-react';

export default function ReceiptConfirmModal({ transfer, onClose, onConfirmReceipt, onPrintSlip }) {
  const [receiverStaff, setReceiverStaff] = useState('Pharmacist on Duty (Physical Count Verified)');
  const [confirmedQty, setConfirmedQty] = useState(transfer?.qty || 120);
  const [discrepancyReason, setDiscrepancyReason] = useState('');
  const [packageIntegrity, setPackageIntegrity] = useState(true);

  if (!transfer) return null;

  const isPartial = Number(confirmedQty) < transfer.qty;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isPartial && !discrepancyReason.trim()) {
      alert('Please provide a reason for the partial receipt discrepancy (e.g. broken or damaged units).');
      return;
    }

    onConfirmReceipt({
      id: transfer.id,
      status: 'completed',
      receipt_confirmed_by: receiverStaff,
      received_quantity: Number(confirmedQty),
      discrepancy_reason: isPartial ? discrepancyReason : null
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <CheckCircle2 size={18} />
            </div>
            <div>
              <h3 className="font-serif text-2xl text-ink font-bold">Confirm Delivery Receipt</h3>
              <p className="text-xs text-slate-500">
                Transfer ID: <b className="text-slate-900">{transfer.id}</b>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Transfer Item details */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs space-y-1.5">
          <div className="font-bold text-emerald-900 text-sm">
            Dispatched: {transfer.qty} units of {transfer.medicine}
          </div>
          <div className="text-emerald-800">
            Delivered From: <b>{transfer.from}</b> &rarr; Destination: <b>{transfer.to}</b>
          </div>
          <div className="text-emerald-700 font-mono text-[11px]">
            Batch: {transfer.fefoBatch}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-slate-700 block mb-1">Dispatched Quantity:</label>
              <input
                type="number"
                readOnly
                value={transfer.qty}
                className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 font-bold text-slate-600"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">Verified Received Quantity:</label>
              <input
                type="number"
                min="1"
                max={transfer.qty}
                value={confirmedQty}
                onChange={(e) => setConfirmedQty(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-emerald-800 focus:outline-none focus:border-emerald-500"
                required
              />
            </div>
          </div>

          {isPartial && (
            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 space-y-1">
              <label className="font-bold text-amber-900 block">
                Discrepancy Reason (Received {confirmedQty} of {transfer.qty} units):
              </label>
              <input
                type="text"
                placeholder="e.g. 20 bottles broken/compromised during transit"
                value={discrepancyReason}
                onChange={(e) => setDiscrepancyReason(e.target.value)}
                className="w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs text-slate-800 focus:outline-none"
                required
              />
            </div>
          )}

          <div>
            <label className="font-bold text-slate-700 block mb-1">Receiving Staff Signature / Verification:</label>
            <input
              type="text"
              value={receiverStaff}
              onChange={(e) => setReceiverStaff(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-800 focus:outline-none focus:border-teal"
              required
            />
          </div>

          <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-[11px] text-emerald-900 flex items-start gap-2">
            <ShieldCheck size={16} className="text-emerald-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Automated Rebalancing: </span>
              Confirming receipt will automatically add <b>{transfer.qty} units</b> to <b>{transfer.to}</b>'s usable inventory and mark this transfer as <b>Completed</b>.
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                if (onPrintSlip) onPrintSlip(transfer);
              }}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-slate-700 hover:bg-slate-50 font-semibold"
            >
              <Printer size={13} /> Print Voucher
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-emerald-600 px-5 py-2 font-bold text-white hover:bg-emerald-700 transition shadow-xs"
              >
                Confirm Receipt &rarr;
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
