import { useState } from 'react';
import { X, Truck, ShieldCheck, CheckCircle2 } from 'lucide-react';

export default function DispatchHandoverModal({ transfer, onClose, onConfirmDispatch }) {
  const [driverName, setDriverName] = useState('Thiru. S. Kumaran (Block Medical Transport)');
  const [vehicleNumber, setVehicleNumber] = useState('TN-19-G-4402 (Ambulance/Van)');
  const [temperatureLogged, setTemperatureLogged] = useState(true);

  if (!transfer) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirmDispatch({
      id: transfer.id,
      status: 'in_transit',
      collection_details: `Handover recorded: Driver ${driverName}, Vehicle ${vehicleNumber}, Temp verified.`
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white">
              <Truck size={18} />
            </div>
            <div>
              <h3 className="font-serif text-2xl text-ink font-bold">Record Handover &amp; Dispatch</h3>
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
        <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 text-xs space-y-1.5">
          <div className="font-bold text-purple-900 text-sm">
            {transfer.qty} units of {transfer.medicine}
          </div>
          <div className="text-purple-800">
            Route: <b>{transfer.from}</b> &rarr; <b>{transfer.to}</b>
          </div>
          <div className="text-purple-700 font-mono text-[11px]">
            Batch: {transfer.fefoBatch}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Assigned Transport Staff / Driver:</label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-800 focus:outline-none focus:border-teal"
              required
            />
          </div>

          <div>
            <label className="font-bold text-slate-700 block mb-1">Vehicle Registration / Mode:</label>
            <input
              type="text"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-medium text-slate-800 focus:outline-none focus:border-teal"
              required
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-[#FAF8F4] p-3 text-[11px] text-slate-700">
            <span className="font-bold text-slate-900">Inventory Notice: </span>
            Clicking <b>"Confirm Dispatch"</b> will immediately deduct {transfer.qty} units from the donor's on-hand stock and mark the shipment as <b>In Transit</b>.
          </div>

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
              className="rounded-full bg-purple-600 px-5 py-2 font-bold text-white hover:bg-purple-700 transition shadow-xs"
            >
              Confirm Handover &amp; Dispatch &rarr;
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
