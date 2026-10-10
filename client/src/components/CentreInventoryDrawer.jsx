import { useState, useMemo } from 'react';
import { X, Search, Filter, ArrowLeft, ArrowUpDown, AlertTriangle, ShieldCheck, Clock, Download } from 'lucide-react';

export default function CentreInventoryDrawer({
  centre,
  medicines = [],
  onClose,
  onRequestMedicine,
  onReturnToMap
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortField, setSortField] = useState('days');
  const [sortAsc, setSortAsc] = useState(true);

  if (!centre) return null;

  const handleReturnToMap = () => {
    if (onReturnToMap) {
      onReturnToMap(centre);
    } else if (onClose) {
      onClose();
    }
  };

  // Build specific inventory items for this centre
  const inventoryItems = useMemo(() => {
    // Generate realistic multi-medicine inventory tailored to this centre's stock ratio
    const baseScale = centre.stock / 100;
    const items = [
      {
        id: 'med-pcm-syp',
        name: 'Paracetamol Pediatric Oral Suspension',
        generic: 'Paracetamol 120mg/5ml',
        category: 'Analgesics & Antipyretics',
        batch: centre.batch || 'TN-PCM-24A',
        qty: centre.stock,
        unit: 'Bottles (60ml)',
        usage: centre.usage,
        days: centre.days,
        safetyStock: centre.usage * 14,
        expiry: centre.expiry || '2027-08-31',
        status: centre.status === 'red' ? 'critical' : centre.status === 'amber' ? 'warning' : 'healthy'
      },
      {
        id: 'med-ors',
        name: 'Oral Rehydration Salts (ORS) WHO Formula',
        generic: 'WHO ORS Sachets 20.5g',
        category: 'Maternal & Child Health',
        batch: 'TN-ORS-25A',
        qty: Math.round(180 * baseScale + 40),
        unit: 'Sachets',
        usage: 12,
        days: Math.round((180 * baseScale + 40) / 12),
        safetyStock: 120,
        expiry: '2027-11-30',
        status: (180 * baseScale + 40) / 12 < 7 ? 'warning' : 'healthy'
      },
      {
        id: 'med-amox-syp',
        name: 'Amoxicillin Trihydrate Oral Suspension',
        generic: 'Amoxicillin 125mg/5ml',
        category: 'Antibiotics',
        batch: 'TN-AMX-24B',
        qty: Math.round(65 * baseScale + 15),
        unit: 'Bottles',
        usage: 6,
        days: Math.round((65 * baseScale + 15) / 6),
        safetyStock: 70,
        expiry: '2027-04-30',
        status: (65 * baseScale + 15) / 6 < 5 ? 'critical' : 'healthy'
      },
      {
        id: 'med-ifa-tab',
        name: 'Iron and Folic Acid Tablets (IFA Large)',
        generic: 'Ferrous Sulphate 100mg + FA 0.5mg',
        category: 'Maternal & Child Health',
        batch: 'TN-IFA-25D',
        qty: Math.round(500 * baseScale + 150),
        unit: 'Tablets',
        usage: 25,
        days: Math.round((500 * baseScale + 150) / 25),
        safetyStock: 250,
        expiry: '2028-02-28',
        status: 'healthy'
      },
      {
        id: 'med-metformin',
        name: 'Metformin Hydrochloride Tablets IP',
        generic: 'Metformin 500mg',
        category: 'NCD Care',
        batch: 'TN-MET-24K',
        qty: Math.round(400 * baseScale + 100),
        unit: 'Tablets',
        usage: 30,
        days: Math.round((400 * baseScale + 100) / 30),
        safetyStock: 300,
        expiry: '2026-12-15', // FEFO Near-expiry
        status: 'healthy'
      },
      {
        id: 'med-asv',
        name: 'Anti-Snake Venom (ASV) Serum Polyvalent',
        generic: 'Polyvalent Snake Antivenom 10ml',
        category: 'Emergency Antidotes',
        batch: 'KBS-ASV-2024-9',
        qty: Math.max(2, Math.round(15 * baseScale)),
        unit: 'Vials',
        usage: 0.5,
        days: Math.round(Math.max(2, Math.round(15 * baseScale)) / 0.5),
        safetyStock: 10,
        expiry: '2027-06-30',
        status: Math.round(15 * baseScale) < 5 ? 'critical' : 'healthy'
      }
    ];

    return items;
  }, [centre]);

  // Filtering & Sorting
  const filtered = useMemo(() => {
    return inventoryItems
      .filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          return item.name.toLowerCase().includes(q) || item.batch.toLowerCase().includes(q) || item.category.toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'days') diff = a.days - b.days;
        else if (sortField === 'qty') diff = a.qty - b.qty;
        else if (sortField === 'name') diff = a.name.localeCompare(b.name);
        return sortAsc ? diff : -diff;
      });
  }, [inventoryItems, search, statusFilter, sortField, sortAsc]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-slate-900/50 backdrop-blur-xs">
      <div className="w-full max-w-3xl h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="border-b border-slate-200 bg-[#FAF8F4] px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleReturnToMap}
              className="rounded-full p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition cursor-pointer"
              title="Return to Map"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-2xl text-ink font-bold">{centre.label}</h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-teal/10 text-teal border border-teal/20">
                  Code: {centre.code}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                On-site Dispensary Inventory &bull; {filtered.length} Medicines Monitored
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Controls Toolbar: Search & Filters */}
        <div className="p-4 border-b border-slate-100 bg-white flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search medicine name, batch number..."
              className="w-full pl-9 pr-3 py-1.5 rounded-full border border-slate-200 bg-[#FAF8F4] text-xs focus:outline-none focus:border-teal"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-full border border-slate-200 bg-[#FAF8F4] px-3 py-1.5 text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="critical">Critical Shortage</option>
              <option value="warning">Low Warning</option>
              <option value="healthy">Healthy Stock</option>
            </select>

            <button
              onClick={() => {
                if (sortField === 'days') setSortAsc(!sortAsc);
                else { setSortField('days'); setSortAsc(true); }
              }}
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-[#FAF8F4] px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
            >
              <ArrowUpDown size={13} /> Days Left {sortField === 'days' ? (sortAsc ? '↑' : '↓') : ''}
            </button>
          </div>
        </div>

        {/* Inventory Table Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F4] text-slate-600 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Medicine & Category</th>
                  <th className="py-2.5 px-3">Batch & Expiry</th>
                  <th className="py-2.5 px-3">Usable Stock</th>
                  <th className="py-2.5 px-3">Daily Use</th>
                  <th className="py-2.5 px-3">Days of Cover</th>
                  <th className="py-2.5 px-3">Safety Stock</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{item.name}</div>
                      <div className="text-[10px] text-slate-500">{item.generic} &bull; {item.category}</div>
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-mono font-semibold text-slate-800">{item.batch}</div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Clock size={10} /> Exp: {item.expiry}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-extrabold text-slate-900">
                      {item.qty} <span className="text-[10px] text-slate-500 font-normal">{item.unit}</span>
                    </td>

                    <td className="py-3 px-3 text-slate-700">
                      {item.usage}/day
                    </td>

                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full font-bold text-[11px] ${
                          item.status === 'critical'
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : item.status === 'warning'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {item.days} days
                      </span>
                    </td>

                    <td className="py-3 px-3 text-slate-500">
                      Min: {item.safetyStock} units
                    </td>

                    <td className="py-3 px-3 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => {
                          if (onOpenBilling) onOpenBilling(centre, item);
                        }}
                        className="rounded-full bg-[#2F6FDB] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#255ec4] transition"
                        title="Issue medicine to patient"
                      >
                        Issue / Bill
                      </button>

                      {item.status === 'critical' || item.status === 'warning' ? (
                        <button
                          onClick={() => {
                            if (onRequestMedicine) onRequestMedicine(centre, item);
                          }}
                          className="rounded-full bg-teal px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-[#095959] transition"
                        >
                          Request Stock
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400">Safe</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="border-t border-slate-200 bg-[#FAF8F4] px-6 py-4 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (onOpenAddStock) onOpenAddStock(centre);
              }}
              className="rounded-full bg-[#0B6E6E] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#095959] transition cursor-pointer"
            >
              + Add Opening Stock
            </button>
            <span className="text-slate-500 hidden sm:inline">
              Simulated data &bull; Live ledger linked
            </span>
          </div>
          <button
            onClick={handleReturnToMap}
            className="rounded-full bg-[#14213D] px-5 py-2 text-xs font-semibold text-white hover:bg-black transition cursor-pointer"
          >
            Return to Map &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
