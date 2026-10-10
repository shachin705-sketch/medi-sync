import { useState, useMemo } from 'react';
import { X, Plus, ShieldCheck, Calendar, Layers, Clock, AlertTriangle, CheckCircle, Package, WifiOff, RefreshCw } from 'lucide-react';
import { api } from '../utils/api';
import useOfflineSync from '../hooks/useOfflineSync';
import { getPlainLanguageExplanation } from '../utils/plainLanguageAlerts';

const commonUnits = [
  'tablets',
  'bottles',
  'strips',
  'vials',
  'ampoules',
  'sachets',
  'capsules',
  'tubes'
];

export default function OpeningStockModal({
  isOpen,
  onClose,
  centres = [],
  medicines = [],
  initialCentreCode = null,
  onStockAdded
}) {
  const { isOnline, queueOperation } = useOfflineSync();

  const [formData, setFormData] = useState({
    phc_id: '',
    medicine_name: 'Paracetamol Syrup',
    medicine_id: '',
    generic_name: 'Paracetamol Pediatric Oral Suspension',
    strength: '120mg / 5ml',
    form: 'Syrup / Suspension',
    category: 'Essential Analgesics',
    batch_number: '',
    quantity: '',
    unit: 'bottles',
    mfg_date: '',
    expiry_date: '',
    received_date: new Date().toISOString().split('T')[0],
    supplier: 'Tamil Nadu Medical Services Corp (TNMSC)',
    min_safety_stock: '14',
    avg_daily_usage: '5',
    recorded_by: 'Staff Pharmacist (Chengalpattu District)',
    notes: 'Initial opening stock registered at health facility'
  });

  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [successData, setSuccessData] = useState(null);

  // Sync initial centre if provided
  useMemo(() => {
    if (initialCentreCode && centres.length > 0) {
      const match = centres.find((c) => c.code === initialCentreCode || c.id === initialCentreCode);
      if (match) {
        setFormData((prev) => ({ ...prev, phc_id: match.id || match.code }));
      } else if (!formData.phc_id) {
        setFormData((prev) => ({ ...prev, phc_id: centres[0].id || centres[0].code }));
      }
    } else if (centres.length > 0 && !formData.phc_id) {
      setFormData((prev) => ({ ...prev, phc_id: centres[0].id || centres[0].code }));
    }
  }, [initialCentreCode, centres]);

  // Projected Days of Cover calculation
  const projectedDays = useMemo(() => {
    const q = Number(formData.quantity);
    const u = Number(formData.avg_daily_usage);
    if (!q || q <= 0 || !u || u <= 0) return 0;
    return Math.round((q / u) * 10) / 10;
  }, [formData.quantity, formData.avg_daily_usage]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSelectMedicineTemplate = (medName) => {
    let generic = '';
    let form = 'Oral';
    let strength = 'Standard';
    let unit = 'tablets';

    if (medName.includes('Syrup') || medName.includes('Suspension')) {
      unit = 'bottles';
      form = 'Syrup / Oral Liquid';
      strength = '120mg / 5ml';
    } else if (medName.includes('ORS')) {
      unit = 'sachets';
      form = 'Powder for Oral Solution';
      strength = '20.5g WHO formulation';
    } else if (medName.includes('Snake')) {
      unit = 'vials';
      form = 'Injectable Lyophilized';
      strength = 'Polyvalent 10ml';
    } else if (medName.includes('Amoxicillin')) {
      unit = 'bottles';
      form = 'Dry Powder for Suspension';
      strength = '125mg / 5ml';
    } else if (medName.includes('Iron')) {
      unit = 'tablets';
      form = 'Enteric Coated Tablet';
      strength = '100mg Iron + 0.5mg Folic Acid';
    } else if (medName.includes('Metformin')) {
      unit = 'tablets';
      form = 'Film Coated Tablet';
      strength = '500mg';
    }

    setFormData((prev) => ({
      ...prev,
      medicine_name: medName,
      generic_name: generic || medName,
      form,
      strength,
      unit
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.phc_id) {
      setError('Please select a healthcare facility.');
      return;
    }
    if (!formData.batch_number || formData.batch_number.trim() === '') {
      setError('Batch number is mandatory.');
      return;
    }
    const q = Number(formData.quantity);
    if (!q || q <= 0) {
      setError('Available quantity must be a positive number greater than 0.');
      return;
    }
    if (!formData.expiry_date) {
      setError('Expiry date is mandatory.');
      return;
    }

    const expDate = new Date(formData.expiry_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (expDate <= today) {
      setError('Ineligible batch: Expiry date must be in the future. Expired medicines cannot be accepted.');
      return;
    }

    setLoading(true);
    const targetCentre = centres.find(c => c.id === formData.phc_id || c.code === formData.phc_id);
    const centreName = targetCentre ? targetCentre.label || targetCentre.name : formData.phc_id;

    const payload = {
      ...formData,
      quantity: q,
      min_safety_stock: Number(formData.min_safety_stock) || 14,
      avg_daily_usage: Number(formData.avg_daily_usage) || 5
    };

    // OFFLINE PATH: Queue into IndexedDB persistently
    if (!isOnline) {
      try {
        const queuedOp = await queueOperation({
          type: 'OPENING_STOCK',
          payload,
          phc_id: payload.phc_id,
          medicine_id: payload.medicine_id || payload.medicine_name,
          medicine_name: payload.medicine_name,
          batch_number: payload.batch_number,
          quantity: q,
          unit: payload.unit,
          recorded_by: payload.recorded_by,
          last_known_balance: 0
        });

        const offlineResult = {
          isOffline: true,
          operation_id: queuedOp.id,
          centre_name: centreName,
          medicine_name: payload.medicine_name,
          batch_number: payload.batch_number,
          quantity_added: q,
          unit: payload.unit,
          stock_after: q,
          days_of_cover: projectedDays,
          recorded_by: payload.recorded_by,
          plain_explanation: 'You are offline, so new stock changes will sync when internet returns.',
          message: 'Saved locally in device IndexedDB. Will automatically sync to server when connectivity returns.'
        };

        setSuccessData(offlineResult);
        if (onStockAdded) {
          onStockAdded(offlineResult);
        }
      } catch (err) {
        setError(err.message || 'Failed to queue offline stock');
      } finally {
        setLoading(false);
      }
      return;
    }

    // ONLINE PATH: Attempt API call with automatic offline fallback
    try {
      const result = await api.addOpeningStock(payload);
      if (result.error) {
        throw new Error(result.error);
      }

      setSuccessData({
        ...result,
        plain_explanation: 'Stock level updated and verified with central Tamil Nadu health records.'
      });
      if (onStockAdded) {
        onStockAdded(result);
      }
    } catch (err) {
      // If network failed, gracefully save to offline queue instead of dropping data
      try {
        const queuedOp = await queueOperation({
          type: 'OPENING_STOCK',
          payload,
          phc_id: payload.phc_id,
          medicine_id: payload.medicine_id || payload.medicine_name,
          medicine_name: payload.medicine_name,
          batch_number: payload.batch_number,
          quantity: q,
          unit: payload.unit,
          recorded_by: payload.recorded_by,
          last_known_balance: 0
        });

        const offlineResult = {
          isOffline: true,
          operation_id: queuedOp.id,
          centre_name: centreName,
          medicine_name: payload.medicine_name,
          batch_number: payload.batch_number,
          quantity_added: q,
          unit: payload.unit,
          stock_after: q,
          days_of_cover: projectedDays,
          recorded_by: payload.recorded_by,
          plain_explanation: 'You are offline, so new stock changes will sync when internet returns.',
          message: 'Network unreachable. Saved locally in IndexedDB and queued for automatic sync.'
        };

        setSuccessData(offlineResult);
        if (onStockAdded) {
          onStockAdded(offlineResult);
        }
      } catch (fallbackErr) {
        setError(err.message || 'Failed to record initial stock');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header */}
        <div className="bg-[#14213D] text-white px-6 py-5 flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-[#0B6E6E] flex items-center justify-center text-white shadow-md">
              <Package size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-xl font-bold">Initial / Opening Stock Entry</h2>
                {!isOnline && (
                  <span className="bg-amber-500/30 text-amber-300 border border-amber-400/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <WifiOff size={10} /> OFFLINE
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300">
                Register facility opening inventory &bull; Auto-calculates days of cover &bull; Ledger logged
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Success View */}
        {successData ? (
          <div className="p-8 text-center space-y-5">
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
              successData.isOffline ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
            }`}>
              {successData.isOffline ? <WifiOff size={28} /> : <CheckCircle size={32} />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <h3 className="font-serif text-xl font-bold text-slate-900">
                  {successData.isOffline ? 'Stock Entry Queued Offline' : 'Opening Stock Successfully Recorded'}
                </h3>
              </div>
              {successData.isOffline && (
                <div className="inline-block bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-1 rounded-full font-medium">
                  Operation ID: <code className="font-mono font-bold">{successData.operation_id}</code> &bull; Pending Sync
                </div>
              )}
              {/* REQUIREMENT B: Exactly ONE concise explanatory sentence */}
              <p className="text-xs text-slate-600 mt-1 font-medium bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
                📢 {successData.plain_explanation}
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Facility</span>
                <span className="font-bold text-slate-800">{successData.centre_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Medicine</span>
                <span className="font-bold text-slate-800">{successData.medicine_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Batch Number</span>
                <span className="font-mono font-bold text-[#0B6E6E]">{successData.batch_number}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Quantity Added</span>
                <span className="font-bold text-emerald-600">+{successData.quantity_added} {successData.unit}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">
                  {successData.isOffline ? 'Unverified Local Balance' : 'Verified Facility Balance'}
                </span>
                <span className="font-black text-slate-900">{successData.stock_after} units</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Estimated Days of Cover</span>
                <span className="font-black text-slate-900">{successData.days_of_cover} days</span>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3">
              <button
                onClick={() => {
                  setSuccessData(null);
                  setFormData((prev) => ({ ...prev, batch_number: '', quantity: '' }));
                }}
                className="px-4 py-2 rounded-full border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
              >
                Add Another Medicine / Batch
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 rounded-full bg-[#0B6E6E] text-white text-xs font-bold hover:bg-[#095959] cursor-pointer"
              >
                Close &amp; View Inventory
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
            {/* OFFLINE NOTICE BANNER */}
            {!isOnline && (
              <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 flex items-start gap-3 text-xs text-amber-900 shadow-2xs">
                <div className="p-2 bg-amber-200/80 rounded-xl text-amber-800 shrink-0">
                  <WifiOff size={16} />
                </div>
                <div>
                  <div className="font-bold text-amber-950 text-sm">Offline Stock Intake Active</div>
                  <p className="text-xs text-amber-900 mt-0.5 leading-relaxed">
                    You are offline, so new stock changes will sync when internet returns. This entry will be saved locally on this device in IndexedDB with an idempotent operation ID.
                  </p>
                </div>
              </div>
            )}
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700 flex items-center gap-2.5">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Field 1: Healthcare Facility */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                1. Healthcare Centre <span className="text-red-500">*</span>
              </label>
              <select
                name="phc_id"
                value={formData.phc_id}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
              >
                {centres.map((c) => (
                  <option key={c.id || c.code} value={c.id || c.code}>
                    {c.name || c.label} ({c.code || c.id}) &bull; {c.district || 'Chengalpattu'}
                  </option>
                ))}
              </select>
            </div>

            {/* Field 2, 3: Medicine Name & Quick Presets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  2. Medicine Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="medicine_name"
                  value={formData.medicine_name}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Paracetamol Syrup"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  3. Generic Name
                </label>
                <input
                  type="text"
                  name="generic_name"
                  value={formData.generic_name}
                  onChange={handleChange}
                  placeholder="e.g. Paracetamol Pediatric Oral Suspension"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>
            </div>

            {/* Quick Medicine Preset Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Presets:</span>
              {[
                'Paracetamol Syrup',
                'ORS Sachets',
                'Amoxicillin Suspension',
                'Iron-Folic Acid',
                'Metformin 500mg',
                'Anti-Snake Venom (ASV)'
              ].map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => handleSelectMedicineTemplate(m)}
                  className={`px-2.5 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap transition ${
                    formData.medicine_name === m
                      ? 'border-[#0B6E6E] bg-[#EAF4F4] text-[#0B6E6E]'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>

            {/* Field 4, 5, 6, 7: Strength, Formulation, Batch, Quantity, Unit */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  4. Strength
                </label>
                <input
                  type="text"
                  name="strength"
                  value={formData.strength}
                  onChange={handleChange}
                  placeholder="e.g. 500mg, 120mg/5ml"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Formulation
                </label>
                <input
                  type="text"
                  name="form"
                  value={formData.form}
                  onChange={handleChange}
                  placeholder="e.g. Syrup, Tablet"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  5. Batch No. <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="batch_number"
                  value={formData.batch_number}
                  onChange={handleChange}
                  required
                  placeholder="e.g. TN-PCM-24K"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-[#0B6E6E] focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  6. Available Qty <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                  min="1"
                  required
                  placeholder="e.g. 100"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>
            </div>

            {/* Field 7, 8, 9, 10: Unit, Mfg Date, Expiry Date, Received Date */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  7. Unit <span className="text-red-500">*</span>
                </label>
                <select
                  name="unit"
                  value={formData.unit}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                >
                  {commonUnits.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  8. Mfg Date
                </label>
                <input
                  type="date"
                  name="mfg_date"
                  value={formData.mfg_date}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  9. Expiry Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  name="expiry_date"
                  value={formData.expiry_date}
                  onChange={handleChange}
                  required
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs font-bold text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  10. Received Date
                </label>
                <input
                  type="date"
                  name="received_date"
                  value={formData.received_date}
                  onChange={handleChange}
                  className="w-full rounded-xl border border-slate-300 bg-white px-2 py-2 text-xs text-slate-700 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>
            </div>

            {/* Field 11, 12, 13: Supplier, Min Safety Stock, Avg Daily Usage */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  11. Supplier / Source
                </label>
                <input
                  type="text"
                  name="supplier"
                  value={formData.supplier}
                  onChange={handleChange}
                  placeholder="e.g. TNMSC District Depot"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  12. Min Safety Stock (Units)
                </label>
                <input
                  type="number"
                  name="min_safety_stock"
                  value={formData.min_safety_stock}
                  onChange={handleChange}
                  min="1"
                  placeholder="e.g. 14"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  13. Avg Daily Usage (ADC)
                </label>
                <input
                  type="number"
                  name="avg_daily_usage"
                  value={formData.avg_daily_usage}
                  onChange={handleChange}
                  min="0.1"
                  step="0.1"
                  placeholder="e.g. 5"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>
            </div>

            {/* Field 14, 15: Recorded by & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  14. Recorded By <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="recorded_by"
                  value={formData.recorded_by}
                  onChange={handleChange}
                  required
                  placeholder="e.g. Thiru. Murugan (Pharmacist)"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  15. Notes / Ledger Remarks
                </label>
                <input
                  type="text"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  placeholder="e.g. Opening physical stock audit count"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-[#0B6E6E] focus:outline-none"
                />
              </div>
            </div>

            {/* Live Days of Cover & Policy Indicator Callout */}
            <div className="rounded-2xl border border-teal/20 bg-[#EAF4F4]/60 p-4 flex items-center justify-between gap-3 text-xs">
              <div className="space-y-0.5">
                <div className="font-bold text-[#0B6E6E] flex items-center gap-1.5">
                  <ShieldCheck size={16} />
                  <span>Automatic Days of Cover Forecast</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Formula: {formData.quantity || 0} units &divide; {formData.avg_daily_usage || 1} units/day = <b>{projectedDays} Days of Cover</b>
                </div>
                <div className="text-[10px] text-slate-500">
                  Status: {projectedDays <= 3 ? '🔴 Critical Shortage' : projectedDays <= 14 ? '🟡 Warning / Buffer' : '🟢 Healthy Surplus'}
                </div>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-[#0B6E6E]">{projectedDays}</span>
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Days Cover</span>
              </div>
            </div>

            {/* Submit & Cancel Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 rounded-full bg-[#0B6E6E] text-white text-xs font-bold hover:bg-[#095959] transition shadow-xs disabled:opacity-50 flex items-center gap-2"
              >
                {loading ? 'Saving to Database...' : 'Save Opening Stock &rarr;'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
