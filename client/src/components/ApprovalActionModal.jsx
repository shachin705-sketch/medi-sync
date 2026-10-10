import { useState } from 'react';
import { X, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function ApprovalActionModal({ transfer, onClose, onConfirmDecision }) {
  const [decision, setDecision] = useState('approve'); // 'approve', 'partial', 'reject'
  const [approvedQty, setApprovedQty] = useState(transfer?.qty || 120);
  const [rejectionReason, setRejectionReason] = useState('');
  const [notes, setNotes] = useState('Approved according to FEFO batch policy and block medical directive.');

  if (!transfer) return null;

  const handleAction = (e) => {
    e.preventDefault();
    if (decision === 'reject' && !rejectionReason.trim()) {
      alert('Please provide a reason for rejecting the transfer request.');
      return;
    }

    onConfirmDecision({
      id: transfer.id,
      status: decision === 'reject' ? 'rejected' : 'approved',
      approved_quantity: decision === 'partial' ? Number(approvedQty) : transfer.qty,
      rejection_reason: rejectionReason,
      notes
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-serif text-2xl text-ink font-bold">Transfer Requisition Decision</h3>
            <p className="text-xs text-slate-500">
              Ref: <b className="text-slate-900">{transfer.id}</b> &bull; Requester: {transfer.to}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        {/* Transfer Item Card */}
        <div className="rounded-2xl border border-slate-200 bg-[#FAF8F4] p-4 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Requested Medicine:</span>
            <span className="font-bold text-slate-900 text-sm">{transfer.medicine}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Requested Quantity:</span>
            <span className="font-extrabold text-slate-900 text-sm">{transfer.qty} units</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">FEFO Allocated Batch:</span>
            <span className="font-mono font-bold text-teal">{transfer.fefoBatch}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Requester Justification:</span>
            <span className="text-slate-700 italic">{transfer.reason}</span>
          </div>
        </div>

        {/* Decision Selector */}
        <form onSubmit={handleAction} className="space-y-4 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1.5">Decision:</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDecision('approve')}
                className={`py-2 px-3 rounded-xl font-bold border transition text-center ${
                  decision === 'approve'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                ✓ Approve Full ({transfer.qty})
              </button>
              <button
                type="button"
                onClick={() => setDecision('partial')}
                className={`py-2 px-3 rounded-xl font-bold border transition text-center ${
                  decision === 'partial'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Adjust Quantity
              </button>
              <button
                type="button"
                onClick={() => setDecision('reject')}
                className={`py-2 px-3 rounded-xl font-bold border transition text-center ${
                  decision === 'reject'
                    ? 'bg-red-600 text-white border-red-600 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                ✕ Reject Request
              </button>
            </div>
          </div>

          {/* Conditional Input based on decision */}
          {decision === 'partial' && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">
                Approved Partial Quantity (to protect local buffer):
              </label>
              <input
                type="number"
                min="10"
                max={transfer.qty}
                value={approvedQty}
                onChange={(e) => setApprovedQty(Number(e.target.value))}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-teal"
                required
              />
            </div>
          )}

          {decision === 'reject' && (
            <div>
              <label className="font-bold text-red-700 block mb-1">Reason for Rejection (required):</label>
              <textarea
                rows={2}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g., Local demand surge expected; stock reserve would drop below 14-day threshold."
                className="w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:border-red-500"
                required
              />
            </div>
          )}

          {decision !== 'reject' && (
            <div>
              <label className="font-bold text-slate-700 block mb-1">Medical Officer Notes / Instructions:</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-800 focus:outline-none focus:border-teal"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-200 px-4 py-2 text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`rounded-full px-5 py-2 font-bold text-white shadow-xs transition ${
                decision === 'reject'
                  ? 'bg-red-600 hover:bg-red-700'
                  : decision === 'partial'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              Confirm Decision &rarr;
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
