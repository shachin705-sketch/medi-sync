import { Printer, X, CheckCircle, ShieldCheck } from 'lucide-react';

export default function TransferSlipModal({ slipData, onClose }) {
  if (!slipData) return null;

  const handlePrint = () => {
    window.print();
  };

  const { transfer } = slipData;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Modal Controls (Hidden in Print) */}
        <div className="no-print flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100 text-teal-800 font-bold text-xs">TN</span>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Official Inter-PHC Stock Transfer Slip</h3>
              <p className="text-xs text-slate-500">Ref: {transfer.req_number}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-700 shadow-sm transition"
            >
              <Printer size={15} /> Print / Save as PDF
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PRINTABLE SLIP CONTENT */}
        <div id="printable-transfer-slip" className="p-8 font-sans text-slate-900 text-sm">
          {/* Official Letterhead */}
          <div className="text-center border-b-2 border-slate-800 pb-4 mb-6">
            <div className="text-xs uppercase tracking-widest font-semibold text-slate-600">Government of Tamil Nadu</div>
            <div className="text-lg font-extrabold uppercase text-slate-900 tracking-wide mt-0.5">Department of Public Health & Preventive Medicine</div>
            <div className="text-xs text-slate-600 mt-1 font-medium">District Drug Redistribution Network &bull; Chengalpattu Health District</div>
            <div className="mt-3 inline-block rounded border border-slate-900 bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wider">
              Inter-PHC Medicine Transfer Voucher &bull; Stock Rebalance Slip
            </div>
          </div>

          {/* Meta Details */}
          <div className="grid grid-cols-2 gap-4 text-xs mb-6 border-b border-slate-200 pb-4">
            <div>
              <p className="text-slate-500 font-medium">Voucher Number:</p>
              <p className="font-bold text-slate-900 text-sm">{transfer.req_number}</p>
              <p className="text-slate-500 font-medium mt-2">Dispatch Timestamp:</p>
              <p className="font-semibold text-slate-800">{transfer.dispatch_date || transfer.created_at}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 font-medium">Transfer Status:</p>
              <p className="font-bold uppercase text-teal-700 text-sm">{transfer.status}</p>
              <p className="text-slate-500 font-medium mt-2">Requisition Authority:</p>
              <p className="font-semibold text-slate-800">{transfer.requester_name}</p>
            </div>
          </div>

          {/* Facility Routes */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-teal-800">Source Facility (Donor)</div>
              <div className="font-bold text-slate-900 mt-1 text-sm">{transfer.source_phc_name}</div>
              <div className="text-xs text-slate-600 mt-1">{transfer.source_address}</div>
              <div className="text-xs text-slate-600 mt-0.5">Phone: {transfer.source_phone}</div>
              <div className="text-xs text-slate-700 mt-2 font-medium">Officer In-charge: {transfer.source_contact || 'Medical Officer'}</div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-red-800">Destination Facility (Recipient)</div>
              <div className="font-bold text-slate-900 mt-1 text-sm">{transfer.dest_phc_name}</div>
              <div className="text-xs text-slate-600 mt-1">{transfer.dest_address}</div>
              <div className="text-xs text-slate-600 mt-0.5">Phone: {transfer.dest_phone}</div>
              <div className="text-xs text-slate-700 mt-2 font-medium">Officer In-charge: {transfer.dest_contact || 'Medical Officer'}</div>
            </div>
          </div>

          {/* Medicine & Batch Table */}
          <div className="mb-6 overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 uppercase font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Item Name & Strength</th>
                  <th className="py-2.5 px-4">Dosage Form</th>
                  <th className="py-2.5 px-4">Batch Number</th>
                  <th className="py-2.5 px-4">Expiry Date</th>
                  <th className="py-2.5 px-4 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-medium">
                <tr>
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-900">{transfer.medicine_name}</div>
                    <div className="text-[11px] text-slate-500 font-normal">{transfer.generic_name}</div>
                  </td>
                  <td className="py-3 px-4 text-slate-700">{transfer.form || 'Suspension'}</td>
                  <td className="py-3 px-4 text-slate-800 font-mono font-semibold">{transfer.batch_number || 'TNMSC-2025-BATCH'}</td>
                  <td className="py-3 px-4 text-slate-800">{transfer.expiry_date || '2027-10-31'}</td>
                  <td className="py-3 px-4 text-right font-extrabold text-slate-900 text-sm">
                    {transfer.quantity} {transfer.unit}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Clinical Justification */}
          <div className="rounded-lg bg-amber-50/70 border border-amber-200 p-3 mb-6 text-xs">
            <span className="font-bold text-amber-900">Transfer Reason: </span>
            <span className="text-amber-800">{transfer.reason}</span>
          </div>

          {/* Cold Chain Certification */}
          {Boolean(transfer.cold_chain_flag) && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 mb-6 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-blue-900">
                <span className="font-bold">Cold-Chain Protocol Verified: </span>
                This biological product requires maintenance between +2°C and +8°C. Vaccine Carrier Box with conditioned ice-packs and digital temperature log was inspected and sealed prior to transit.
              </div>
            </div>
          )}

          {/* Signatures & Certification Grid */}
          <div className="grid grid-cols-4 gap-4 pt-10 border-t border-slate-300 text-center text-[11px] text-slate-600 mt-10">
            <div>
              <div className="h-10 border-b border-dashed border-slate-400 mb-1"></div>
              <div className="font-bold text-slate-800">Dispatching Pharmacist</div>
              <div>({transfer.source_phc_name})</div>
            </div>
            <div>
              <div className="h-10 border-b border-dashed border-slate-400 mb-1 flex items-center justify-center text-teal-800 font-serif italic text-xs">
                {transfer.approver_name || 'Dr. Approved'}
              </div>
              <div className="font-bold text-slate-800">Source Medical Officer</div>
              <div>Signature & Seal</div>
            </div>
            <div>
              <div className="h-10 border-b border-dashed border-slate-400 mb-1"></div>
              <div className="font-bold text-slate-800">Driver / Transport Staff</div>
              <div>Transit Custody</div>
            </div>
            <div>
              <div className="h-10 border-b border-dashed border-slate-400 mb-1"></div>
              <div className="font-bold text-slate-800">Receiving Pharmacist</div>
              <div>({transfer.dest_phc_name})</div>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-400 mt-8 pt-4 border-t border-slate-100">
            MediSync PHC Automated Inventory Control &bull; System Generated Document ID: {slipData.slip_header.voucher_number} &bull; Generated at {new Date().toLocaleString('en-IN')}
          </div>
        </div>
      </div>
    </div>
  );
}
