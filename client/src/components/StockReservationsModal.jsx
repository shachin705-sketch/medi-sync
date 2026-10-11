import React from 'react';
import { X, Lock, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

export default function StockReservationsModal({
  isOpen,
  onClose,
  reservations = []
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-3xl rounded-[28px] bg-white p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 border border-blue-200 text-blue-700 shadow-2xs">
              <Lock size={20} />
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold text-slate-900">
                Active Stock Reservations
              </h3>
              <p className="text-xs text-slate-500">
                Double-allocation prevention: Committed units locked at donor centres prior to physical dispatch.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Informational banner */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-3.5 text-xs text-blue-900 flex items-start gap-2.5 flex-shrink-0">
          <ShieldCheck size={18} className="text-blue-700 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Surplus Isolation Guarantee:</span>
            <p className="text-blue-800 leading-relaxed">
              When a requisition is approved (automatically under Policy A or manually by a MO), the required quantity is atomically reserved from the donor's FEFO batch. This deducts the stock from the available unreserved balance, ensuring parallel requisitions cannot double-allocate the same units.
            </p>
          </div>
        </div>

        {/* Reservations Table */}
        <div className="flex-1 overflow-y-auto rounded-2xl border border-slate-200">
          {reservations.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs space-y-2">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500" />
              <p className="font-bold text-slate-700">No active stock reservations pending dispatch.</p>
              <p className="text-[11px] text-slate-400">All approved transfer quantities have been physically dispatched or no requisitions are currently in the reserved stage.</p>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F4] text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-3 px-4">Reservation Ref</th>
                  <th className="py-3 px-4">Donor Centre</th>
                  <th className="py-3 px-4">Medicine &amp; Unit</th>
                  <th className="py-3 px-4">Locked Batch (FEFO)</th>
                  <th className="py-3 px-4 text-right">Reserved Qty</th>
                  <th className="py-3 px-4 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium bg-white">
                {reservations.map((res) => (
                  <tr key={res.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-slate-700">
                      <div>{res.id}</div>
                      <div className="text-[10px] text-slate-400">Req: {res.requisition_id}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{res.phc_name}</div>
                      <div className="text-[10px] text-slate-400">{res.phc_id}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{res.medicine_name}</div>
                      <div className="text-[10px] text-slate-400">{res.unit || 'units'}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[#0B6E6E]">
                      {res.batch_number}
                    </td>
                    <td className="py-3 px-4 text-right font-black text-slate-900 text-sm">
                      {res.reserved_quantity} <span className="text-[10px] text-slate-500 font-normal">{res.unit}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 border border-blue-200 px-2.5 py-0.5 text-[10px] font-bold text-blue-800">
                        <Lock size={10} />
                        LOCKED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-slate-900 text-white px-5 py-2 text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
