import { useState, useEffect, useMemo } from 'react';
import {
  HeartPulse, LayoutDashboard, Pill, PlusCircle, Navigation,
  Truck, Sparkles, FileText, Bot, Globe, ShieldAlert,
  AlertTriangle, CheckCircle2, Clock, MapPin, Phone,
  Search, Filter, ArrowUpRight, ArrowDownRight, RefreshCw,
  Printer, Check, ChevronRight, Layers, Eye, Building2, Flame
} from 'lucide-react';
import { translations } from '../utils/translations';
import { api } from '../utils/api';
import SurplusMap from '../components/SurplusMap';
import MedicineDetailModal from '../components/MedicineDetailModal';
import RequestTransferModal from '../components/RequestTransferModal';
import AutoDraftIndentModal from '../components/AutoDraftIndentModal';
import TransferSlipModal from '../components/TransferSlipModal';
import StaffChatbotModal from '../components/StaffChatbotModal';
import { Link } from 'react-router-dom';

export default function MediSyncApp({ lang = 'en', onToggleLang }) {
  const t = translations[lang] || translations.en;
  const isTamil = lang === 'ta';

  // Active User / Persona State
  const [currentUser, setCurrentUser] = useState({
    id: 'usr-pharm-tpr',
    name: 'Thiru. Murugan',
    role: 'pharmacist',
    phc_id: 'phc-thiruporur',
    phc_name: 'Thiruporur PHC',
    phc_block: 'Thiruporur Block',
    token: 'mock-jwt-token'
  });

  const personas = [
    {
      id: 'usr-pharm-tpr',
      role: 'pharmacist',
      label: 'Pharmacist (Thiruporur PHC)',
      name: 'Thiru. Murugan',
      phc_id: 'phc-thiruporur',
      phc_name: 'Thiruporur PHC',
      phc_block: 'Thiruporur Block'
    },
    {
      id: 'usr-mo-tpr',
      role: 'medical_officer',
      label: 'Medical Officer (Thiruporur PHC)',
      name: 'Dr. S. Kaviya',
      phc_id: 'phc-thiruporur',
      phc_name: 'Thiruporur PHC',
      phc_block: 'Thiruporur Block'
    },
    {
      id: 'usr-bmo-tpr',
      role: 'block_officer',
      label: 'Block Medical Officer (Thiruporur Block)',
      name: 'Dr. Jayanthi Raman',
      phc_id: 'phc-thiruporur',
      phc_name: 'Thiruporur PHC',
      phc_block: 'Thiruporur Block'
    },
    {
      id: 'usr-admin-chengalpattu',
      role: 'district_admin',
      label: 'District Admin (DDHS Chengalpattu)',
      name: 'Dr. A. Sundararajan',
      phc_id: 'phc-thiruporur',
      phc_name: 'District Health HQ',
      phc_block: 'Chengalpattu District'
    }
  ];

  // Navigation Tabs
  const [activeTab, setActiveTab] = useState('dashboard');

  // Application Data States
  const [phcs, setPhcs] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [daysOfStock, setDaysOfStock] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [indents, setIndents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modals States
  const [selectedMedicineForDetail, setSelectedMedicineForDetail] = useState(null);
  const [transferModalData, setTransferModalData] = useState(null);
  const [autoIndentModalData, setAutoIndentModalData] = useState(null);
  const [slipModalData, setSlipModalData] = useState(null);
  const [showChatbot, setShowChatbot] = useState(false);

  // Nearby Stock Finder States
  const [nearbyMedId, setNearbyMedId] = useState('med-pcm-syp');
  const [nearbyResults, setNearbyResults] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [multiBasketMode, setMultiBasketMode] = useState(false);
  const [basketSelectedMeds, setBasketSelectedMeds] = useState(['med-pcm-syp', 'med-amox-syp']);
  const [multiBasketResults, setMultiBasketResults] = useState(null);

  // Stock Entry Form State
  const [entryMedId, setEntryMedId] = useState('med-pcm-syp');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [openingStock, setOpeningStock] = useState(24);
  const [receivedQty, setReceivedQty] = useState(0);
  const [dispensedQty, setDispensedQty] = useState(16);
  const [batchNo, setBatchNo] = useState('TN-PCM-2026-A');
  const [expiryDateVal, setExpiryDateVal] = useState('2027-10-31');
  const [entryNotes, setEntryNotes] = useState('Daily evening dispensary physical balance');
  const [entrySuccess, setEntrySuccess] = useState(null);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  // Stock List Filters
  const [stockSearch, setStockSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [criticalOnlyFilter, setCriticalOnlyFilter] = useState(false);
  const [coldChainOnlyFilter, setColdChainOnlyFilter] = useState(false);

  // AI & Reports State
  const [recommendations, setRecommendations] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [seasonalData, setSeasonalData] = useState(null);
  const [consolidatedRoutes, setConsolidatedRoutes] = useState([]);
  const [districtSummary, setDistrictSummary] = useState(null);
  const [blockRiskMap, setBlockRiskMap] = useState([]);

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [phcRes, medRes, stockRes, alertRes, trfRes, indRes] = await Promise.all([
        api.getPhcs(),
        api.getMedicines(),
        api.getDaysOfStock(currentUser.phc_id),
        api.getAlerts({ phc: currentUser.role === 'district_admin' ? '' : currentUser.phc_id }),
        api.getTransfers({ phc: currentUser.role === 'district_admin' ? '' : currentUser.phc_id }),
        api.getIndents({ phc: currentUser.role === 'district_admin' ? '' : currentUser.phc_id })
      ]);

      setPhcs(phcRes || []);
      setMedicines(medRes || []);
      setDaysOfStock(stockRes || []);
      setAlerts(alertRes || []);
      setTransfers(trfRes || []);
      setIndents(indRes || []);

      // Check offline queue count
      setOfflineQueueCount(api.getOfflineQueue().length);
    } catch (err) {
      console.error('Error fetching MediSync core data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser.phc_id, currentUser.role]);

  // Load Nearby Stock when selection changes
  const loadNearbySurplus = async () => {
    if (!nearbyMedId) return;
    setNearbyLoading(true);
    try {
      if (multiBasketMode) {
        const res = await api.getMultiBasketNearbyStock(basketSelectedMeds, currentUser.phc_id);
        setMultiBasketResults(res);
      } else {
        const res = await api.getNearbyStock(nearbyMedId, currentUser.phc_id);
        setNearbyResults(res);
      }
    } catch (err) {
      console.error('Failed to load nearby stock:', err);
    } finally {
      setNearbyLoading(false);
    }
  };

  useEffect(() => {
    loadNearbySurplus();
  }, [nearbyMedId, multiBasketMode, basketSelectedMeds, currentUser.phc_id]);

  // Load AI and Report Insights
  useEffect(() => {
    if (activeTab === 'ai_insights' || activeTab === 'reports') {
      Promise.all([
        api.getRedistributionRecommendations(currentUser.role === 'district_admin' ? '' : currentUser.phc_id),
        api.getAnomalies(currentUser.role === 'district_admin' ? '' : currentUser.phc_id),
        api.getSeasonalContext(),
        api.getConsolidatedRoutes(currentUser.role === 'district_admin' ? '' : currentUser.phc_id),
        api.getDistrictSummary(),
        api.getBlockRiskMap()
      ]).then(([recs, anoms, seas, routes, dist, bmap]) => {
        setRecommendations(recs || []);
        setAnomalies(anoms || []);
        setSeasonalData(seas || null);
        setConsolidatedRoutes(routes || []);
        setDistrictSummary(dist || null);
        setBlockRiskMap(bmap || []);
      }).catch(console.error);
    }
  }, [activeTab, currentUser.phc_id]);

  // Handlers
  const handlePersonaChange = (e) => {
    const selected = personas.find((p) => p.id === e.target.value);
    if (selected) {
      setCurrentUser((prev) => ({
        ...prev,
        id: selected.id,
        name: selected.name,
        role: selected.role,
        phc_id: selected.phc_id,
        phc_name: selected.phc_name,
        phc_block: selected.phc_block
      }));
    }
  };

  const handleStockEntrySubmit = async (e) => {
    e.preventDefault();
    setEntrySuccess(null);

    const calculatedClosing = Number(openingStock) + Number(receivedQty) - Number(dispensedQty);
    const res = await api.recordStockEntry({
      phc_id: currentUser.phc_id,
      medicine_id: entryMedId,
      entry_date: entryDate,
      opening_stock: Number(openingStock),
      received_quantity: Number(receivedQty),
      dispensed_quantity: Number(dispensedQty),
      closing_stock: calculatedClosing,
      batch_number: batchNo,
      expiry_date: expiryDateVal,
      notes: entryNotes
    }, currentUser.token);

    if (res.offline_queued) {
      setEntrySuccess('Entry queued locally (Offline mode active). Will sync upon reconnection.');
      setOfflineQueueCount(api.getOfflineQueue().length);
    } else {
      setEntrySuccess(`Stock updated successfully! Calculated Closing: ${calculatedClosing} units.`);
      fetchData();
    }
  };

  const handleSyncOfflineQueue = async () => {
    const res = await api.syncOfflineQueue(currentUser.token);
    alert(`Synced ${res.synced} offline records successfully!`);
    setOfflineQueueCount(res.remaining || 0);
    fetchData();
  };

  const handleUpdateTransferStatus = async (transferId, status) => {
    try {
      await api.updateTransferStatus(transferId, status, `Updated by ${currentUser.name}`, currentUser.token);
      fetchData();
    } catch (err) {
      alert('Failed to update transfer status: ' + err.message);
    }
  };

  const handleOpenTransferSlip = async (transferId) => {
    try {
      const data = await api.getTransferSlip(transferId);
      setSlipModalData(data);
    } catch (err) {
      alert('Failed to fetch transfer slip: ' + err.message);
    }
  };

  // Filtered Stock List
  const filteredStock = useMemo(() => {
    return daysOfStock.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (criticalOnlyFilter && !item.critical_flag) return false;
      if (coldChainOnlyFilter && !item.cold_chain_flag) return false;
      if (stockSearch) {
        const q = stockSearch.toLowerCase();
        return (
          item.medicine_name.toLowerCase().includes(q) ||
          item.generic_name.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [daysOfStock, statusFilter, categoryFilter, criticalOnlyFilter, coldChainOnlyFilter, stockSearch]);

  const categories = useMemo(() => {
    const cats = new Set(daysOfStock.map((i) => i.category));
    return Array.from(cats);
  }, [daysOfStock]);

  // Counts for KPIs
  const criticalShortagesCount = daysOfStock.filter((i) => i.status === 'red').length;
  const amberCount = daysOfStock.filter((i) => i.status === 'amber').length;
  const greenCount = daysOfStock.filter((i) => i.status === 'green').length;
  const pendingTransfersCount = transfers.filter((t) => ['requested', 'approved', 'in_transit'].includes(t.status)).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
      {/* 1. TOP OFFICIAL HEADER & NAVIGATION */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Logo & Health Dept Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white font-black shadow-md shadow-teal-600/20">
              <HeartPulse size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-tight text-slate-900">MediSync PHC</span>
                <span className="bg-teal-50 border border-teal-200 text-teal-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  TN Public Health
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                {currentUser.phc_name} &bull; {currentUser.phc_block} &bull; Chengalpattu
              </p>
            </div>
          </div>

          {/* Right Action Bar: Role Switcher, Offline Indicator, Language Toggle, Public Link */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Offline Sync Status */}
            {offlineQueueCount > 0 ? (
              <button
                onClick={handleSyncOfflineQueue}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500 text-white px-3 py-1.5 text-xs font-bold shadow-sm hover:bg-amber-600 transition"
              >
                <RefreshCw size={13} className="animate-spin" />
                <span>{offlineQueueCount} Offline Queued</span>
              </button>
            ) : (
              <span className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span> Online
              </span>
            )}

            {/* Persona Switcher */}
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <span className="text-[11px] font-bold text-slate-600 pl-2">Role:</span>
              <select
                value={currentUser.id}
                onChange={handlePersonaChange}
                className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-800 border-none shadow-2xs focus:outline-none"
              >
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Language Toggle */}
            <button
              onClick={onToggleLang}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              <Globe size={14} />
              <span>{isTamil ? 'English' : 'தமிழ்'}</span>
            </button>

            {/* Public Availability Link */}
            <Link
              to="/public"
              target="_blank"
              className="flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-800 hover:bg-teal-100 transition shadow-2xs"
            >
              <Eye size={13} />
              <span>{isTamil ? 'பொது சரிபார்ப்பு' : 'Public Checker'}</span>
            </Link>

            {/* Chatbot Trigger */}
            <button
              onClick={() => setShowChatbot(true)}
              className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 shadow-sm transition"
            >
              <Bot size={14} />
              <span>AI Chatbot</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <div className="max-w-7xl mx-auto px-4 border-t border-slate-100 flex items-center gap-1 overflow-x-auto scrollbar-none py-1">
          {[
            { id: 'dashboard', label: t.nav_dashboard, icon: LayoutDashboard },
            { id: 'stock_list', label: t.nav_stock_list, icon: Pill, badge: criticalShortagesCount > 0 ? criticalShortagesCount : null },
            { id: 'stock_entry', label: t.nav_stock_entry, icon: PlusCircle },
            { id: 'nearby_finder', label: t.nav_nearby_finder, icon: Navigation },
            { id: 'transfers', label: t.nav_transfers, icon: Truck, badge: pendingTransfersCount > 0 ? pendingTransfersCount : null },
            { id: 'ai_insights', label: t.nav_ai_insights, icon: Sparkles },
            { id: 'reports', label: t.nav_reports, icon: FileText }
          ].map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-bold transition flex-shrink-0 ${
                activeTab === id
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon size={14} />
              <span>{label}</span>
              {badge !== null && badge !== undefined && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  activeTab === id ? 'bg-white text-teal-800' : 'bg-red-500 text-white'
                }`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* 2. MAIN APPLICATION CONTENT VIEW CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* ========================================================= */}
        {/* TAB 1: DASHBOARD                                         */}
        {/* ========================================================= */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {/* Top Critical Alerts Ticker Banner */}
            {criticalShortagesCount > 0 && (
              <div className="rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-orange-50/50 p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm flex-shrink-0 mt-0.5">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-extrabold text-red-900">
                      {isTamil ? 'அவசர மருந்து பற்றாக்குறை கண்டறியப்பட்டது!' : 'Critical Stock-Out Imminent at Centre!'}
                    </h3>
                    <p className="text-xs text-red-800/90 mt-0.5 max-w-2xl">
                      {daysOfStock.find((m) => m.status === 'red')
                        ? `${daysOfStock.find((m) => m.status === 'red')?.medicine_name} has only ${daysOfStock.find((m) => m.status === 'red')?.days_left} days left on hand. Consumption velocity is high.`
                        : 'Immediate inter-PHC stock sharing recommended.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const shortage = daysOfStock.find((m) => m.status === 'red');
                      if (shortage) setNearbyMedId(shortage.medicine_id);
                      setActiveTab('nearby_finder');
                    }}
                    className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 shadow-sm transition whitespace-nowrap"
                  >
                    <Navigation size={14} /> Find Nearest Surplus
                  </button>
                </div>
              </div>
            )}

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Critical Shortages</div>
                  <div className="text-2xl font-black text-red-600 mt-1 flex items-baseline gap-2">
                    {criticalShortagesCount}
                    <span className="text-xs font-medium text-slate-400">medicines (&lt;15d)</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-red-700 bg-red-50 px-2 py-1 rounded-lg">
                  <AlertTriangle size={12} /> Requires immediate redistribution
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Low Buffer Medicines</div>
                  <div className="text-2xl font-black text-amber-600 mt-1 flex items-baseline gap-2">
                    {amberCount}
                    <span className="text-xs font-medium text-slate-400">medicines (15-30d)</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-lg">
                  <Clock size={12} /> Watch list for monthly indent
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sufficient Reserves</div>
                  <div className="text-2xl font-black text-emerald-600 mt-1 flex items-baseline gap-2">
                    {greenCount}
                    <span className="text-xs font-medium text-slate-400">medicines (&gt;30d)</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">
                  <CheckCircle2 size={12} /> Eligible for donor surplus
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Transfers</div>
                  <div className="text-2xl font-black text-teal-700 mt-1 flex items-baseline gap-2">
                    {pendingTransfersCount}
                    <span className="text-xs font-medium text-slate-400">inter-PHC shipments</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-teal-800 bg-teal-50 px-2 py-1 rounded-lg">
                  <Truck size={12} /> Average transit: ~22 minutes
                </div>
              </div>
            </div>

            {/* Dual Grid: Recent Active Alerts + Fast Action Shortcuts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left 2 Cols: Priority Alerts */}
              <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ShieldAlert size={18} className="text-teal-600" />
                    <h3 className="text-sm font-bold text-slate-900">Clinical & Inventory Alerts</h3>
                  </div>
                  <button
                    onClick={() => setActiveTab('stock_list')}
                    className="text-xs font-bold text-teal-700 hover:text-teal-800"
                  >
                    View All Medicines &rarr;
                  </button>
                </div>

                <div className="space-y-3">
                  {alerts.slice(0, 4).map((alt) => (
                    <div
                      key={alt.id}
                      className={`rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        alt.severity === 'critical'
                          ? 'border-red-200 bg-red-50/50'
                          : 'border-amber-200 bg-amber-50/50'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            alt.severity === 'critical' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'
                          }`}>
                            {alt.alert_type.replace('_', ' ')}
                          </span>
                          <span className="font-bold text-slate-900 text-xs">{alt.medicine_name}</span>
                          <span className="text-[11px] text-slate-500 font-medium">&bull; {alt.days_left} days left</span>
                        </div>
                        <p className="text-xs text-slate-700 leading-snug">{alt.message}</p>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => {
                            setNearbyMedId(alt.medicine_id);
                            setActiveTab('nearby_finder');
                          }}
                          className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 transition"
                        >
                          Find Surplus
                        </button>
                        <button
                          onClick={() => {
                            api.updateAlertStatus(alt.id, 'acknowledged', currentUser.token);
                            fetchData();
                          }}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                        >
                          Ack
                        </button>
                      </div>
                    </div>
                  ))}
                  {alerts.length === 0 && (
                    <div className="text-center py-8 text-xs text-slate-400">No active alerts. All inventories optimal.</div>
                  )}
                </div>
              </div>

              {/* Right Col: Quick Clinical Shortcuts */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-teal-600" />
                  Quick Actions & Tasks
                </h3>

                <div className="space-y-2.5">
                  <button
                    onClick={() => setActiveTab('stock_entry')}
                    className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-teal-500 hover:bg-teal-50/50 transition group"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-teal-900">1. Daily Stock Entry</div>
                      <div className="text-[11px] text-slate-500">Record daily physical dispensing count</div>
                    </div>
                    <PlusCircle size={16} className="text-slate-400 group-hover:text-teal-600" />
                  </button>

                  <button
                    onClick={() => setActiveTab('nearby_finder')}
                    className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-teal-500 hover:bg-teal-50/50 transition group"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-teal-900">2. Nearby Surplus Finder</div>
                      <div className="text-[11px] text-slate-500">Search surplus by Haversine distance</div>
                    </div>
                    <Navigation size={16} className="text-slate-400 group-hover:text-teal-600" />
                  </button>

                  <button
                    onClick={() => setActiveTab('transfers')}
                    className="w-full flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left hover:border-teal-500 hover:bg-teal-50/50 transition group"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 group-hover:text-teal-900">3. Approve Transfers</div>
                      <div className="text-[11px] text-slate-500">Medical Officer review & voucher generation</div>
                    </div>
                    <Truck size={16} className="text-slate-400 group-hover:text-teal-600" />
                  </button>

                  <button
                    onClick={() => setShowChatbot(true)}
                    className="w-full flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/70 p-3 text-left hover:bg-teal-100/60 transition group"
                  >
                    <div>
                      <div className="text-xs font-bold text-teal-950">4. Staff AI Chatbot</div>
                      <div className="text-[11px] text-teal-800">Ask questions in English or Tamil</div>
                    </div>
                    <Bot size={16} className="text-teal-700" />
                  </button>
                </div>

                {/* Tamil Nadu Seasonal Advisory Box */}
                <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3 text-xs text-orange-950">
                  <div className="flex items-center gap-1.5 font-bold text-orange-900 mb-0.5">
                    <Flame size={13} className="text-orange-600" />
                    Epidemiological Season Alert
                  </div>
                  Northeast Monsoon fever spike active. Ensure pediatric Paracetamol and Amoxicillin buffers are maintained above 25 days.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: MEDICINE STOCK LIST (Days-of-Stock Tracking)      */}
        {/* ========================================================= */}
        {activeTab === 'stock_list' && (
          <div className="space-y-4">
            {/* Filter & Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    placeholder="Search medicine name, generic name, category..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3.5 py-2 text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value="all">All Days-of-Stock Statuses</option>
                    <option value="red">Red: Critical Shortage (&lt;15d)</option>
                    <option value="amber">Amber: Low Buffer (15-30d)</option>
                    <option value="green">Green: Sufficient (&gt;30d)</option>
                  </select>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-4 text-xs font-medium text-slate-600 pt-1 border-t border-slate-100">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={criticalOnlyFilter}
                    onChange={(e) => setCriticalOnlyFilter(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Critical Life-Saving Only (⚡)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={coldChainOnlyFilter}
                    onChange={(e) => setColdChainOnlyFilter(e.target.checked)}
                    className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span>Cold-Chain Biologicals (❄️)</span>
                </label>
                <span className="ml-auto text-slate-400 text-[11px]">
                  Showing {filteredStock.length} of {daysOfStock.length} medicines
                </span>
              </div>
            </div>

            {/* Table of Medicines */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200 text-[11px]">
                    <tr>
                      <th className="py-3 px-4">Medicine & Clinical Category</th>
                      <th className="py-3 px-4">Current Balance</th>
                      <th className="py-3 px-4">Avg Daily Use (7d)</th>
                      <th className="py-3 px-4">Days Left & Status</th>
                      <th className="py-3 px-4">Consumption Velocity</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredStock.map((item) => (
                      <tr
                        key={item.medicine_id}
                        className="hover:bg-slate-50/80 transition cursor-pointer"
                        onClick={() => setSelectedMedicineForDetail(item)}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{item.medicine_name}</span>
                            {item.critical_flag && (
                              <span title="Critical Emergency Essential" className="text-red-600 font-bold text-xs">⚡</span>
                            )}
                            {item.cold_chain_flag && (
                              <span title="Cold Chain (2-8°C)" className="text-blue-600 font-bold text-xs">❄️</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {item.generic_name} &bull; <span className="text-slate-600">{item.category}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-extrabold text-slate-900 text-sm">
                            {item.current_quantity} <span className="font-normal text-xs text-slate-500">{item.unit}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            Batch: {item.batch_number || 'N/A'}
                          </div>
                        </td>

                        <td className="py-3 px-4 text-slate-700">
                          <div className="font-bold">{item.adc7} <span className="text-[10px] font-normal text-slate-500">/day</span></div>
                          <div className="text-[10px] text-slate-400">30d: {item.adc30}/day</div>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold ${
                              item.status === 'red'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : item.status === 'amber'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${
                              item.status === 'red' ? 'bg-red-600' : item.status === 'amber' ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}></span>
                            {item.days_left} days ({item.status_label})
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1 text-xs font-semibold">
                            {item.trend === 'rapidly_falling' && (
                              <span className="text-red-600 flex items-center gap-0.5">
                                <ArrowDownRight size={14} /> Rapid Drop
                              </span>
                            )}
                            {item.trend === 'falling' && (
                              <span className="text-amber-600 flex items-center gap-0.5">
                                <ArrowDownRight size={14} /> Falling
                              </span>
                            )}
                            {item.trend === 'stable' && (
                              <span className="text-slate-600">Stable</span>
                            )}
                            {item.trend === 'accumulating' && (
                              <span className="text-emerald-600 flex items-center gap-0.5">
                                <ArrowUpRight size={14} /> Accumulating
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">{item.rate_of_decline} units/day</div>
                        </td>

                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {item.status === 'red' && (
                              <button
                                onClick={() => {
                                  setNearbyMedId(item.medicine_id);
                                  setActiveTab('nearby_finder');
                                }}
                                className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-teal-700 transition"
                              >
                                Find Surplus
                              </button>
                            )}
                            <button
                              onClick={() => setSelectedMedicineForDetail(item)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
                            >
                              Charts &rarr;
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: DAILY STOCK ENTRY (Pharmacist Physical Register)    */}
        {/* ========================================================= */}
        {activeTab === 'stock_entry' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-base font-bold text-slate-900">Pharmacist Daily Stock Register Entry</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record opening, receipts from district warehouse, and dispensing to outpatients.
                </p>
              </div>

              {entrySuccess && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <span>{entrySuccess}</span>
                </div>
              )}

              <form onSubmit={handleStockEntrySubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Select Medicine</label>
                    <select
                      value={entryMedId}
                      onChange={(e) => {
                        setEntryMedId(e.target.value);
                        const match = daysOfStock.find((d) => d.medicine_id === e.target.value);
                        if (match) {
                          setOpeningStock(match.current_quantity);
                          setBatchNo(match.batch_number || 'TNMSC-2026-B');
                        }
                      }}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                    >
                      {medicines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.strength})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Register Date</label>
                    <input
                      type="date"
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-semibold text-slate-800 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Opening, Received, Dispensed, Calculated Closing */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Opening Stock</label>
                    <input
                      type="number"
                      min="0"
                      value={openingStock}
                      onChange={(e) => setOpeningStock(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-teal-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Received (+)</label>
                    <input
                      type="number"
                      min="0"
                      value={receivedQty}
                      onChange={(e) => setReceivedQty(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-teal-700 focus:border-teal-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Dispensed (-)</label>
                    <input
                      type="number"
                      min="0"
                      value={dispensedQty}
                      onChange={(e) => setDispensedQty(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-orange-700 focus:border-teal-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                {/* Auto Calculated Closing Stock Banner */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">Calculated Closing Physical Balance:</span>
                  <span className="text-base font-black text-slate-900">
                    {Number(openingStock) + Number(receivedQty) - Number(dispensedQty)} units
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Batch Number</label>
                    <input
                      type="text"
                      value={batchNo}
                      onChange={(e) => setBatchNo(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Expiry Date</label>
                    <input
                      type="date"
                      value={expiryDateVal}
                      onChange={(e) => setExpiryDateVal(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Audit Notes</label>
                  <input
                    type="text"
                    value={entryNotes}
                    onChange={(e) => setEntryNotes(e.target.value)}
                    placeholder="Physical counter verification / Outpatient surge"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-teal-600 py-3 text-xs font-bold text-white hover:bg-teal-700 shadow-sm transition flex items-center justify-center gap-2"
                >
                  <PlusCircle size={16} /> Save Daily Stock Entry
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: NEARBY STOCK FINDER (Leaflet Map & Haversine)       */}
        {/* ========================================================= */}
        {activeTab === 'nearby_finder' && (
          <div className="space-y-6">
            {/* Top Selector Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Navigation size={18} className="text-teal-600" />
                    Nearby Surplus Locator (Haversine Spatial Routing)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Find nearest PHCs holding surplus stock to solve urgent stock-outs.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMultiBasketMode(!multiBasketMode)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                      multiBasketMode
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {multiBasketMode ? 'Multi-Medicine Basket Active' : 'Enable Multi-Medicine Search'}
                  </button>
                </div>
              </div>

              {!multiBasketMode ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Select Medicine Facing Shortage</label>
                    <select
                      value={nearbyMedId}
                      onChange={(e) => setNearbyMedId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-800 focus:outline-none"
                    >
                      {medicines.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.strength})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Requesting Health Centre</label>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-800 flex items-center justify-between">
                      <span>{currentUser.phc_name}</span>
                      <span className="text-[11px] text-red-600 font-extrabold">
                        {nearbyResults?.requesting_phc?.current_metrics?.days_left !== undefined
                          ? `${nearbyResults.requesting_phc.current_metrics.days_left} days left`
                          : 'Checking...'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 space-y-2">
                  <div className="text-xs font-bold text-teal-900">
                    Select Multiple Medicines to Combine in One Delivery Trip:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {medicines.slice(0, 8).map((m) => {
                      const isSelected = basketSelectedMeds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            if (isSelected) {
                              setBasketSelectedMeds(basketSelectedMeds.filter((id) => id !== m.id));
                            } else {
                              setBasketSelectedMeds([...basketSelectedMeds, m.id]);
                            }
                          }}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold border transition ${
                            isSelected
                              ? 'bg-teal-600 text-white border-teal-600'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {isSelected ? '✓ ' : '+ '}{m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Map and Results Split Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column: Interactive Leaflet Map */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    District Geographic Spatial Map
                  </h4>
                  <span className="text-[11px] text-slate-500">Haversine GPS Coordinates</span>
                </div>
                <SurplusMap
                  requestingPhc={nearbyResults?.requesting_phc || phcs.find((p) => p.id === currentUser.phc_id)}
                  surplusPhcs={nearbyResults?.results?.filter((r) => r.can_fulfill_surplus) || []}
                  onSelectPhc={(donor) => {
                    setTransferModalData({
                      source_phc_id: donor.phc_id,
                      dest_phc_id: currentUser.phc_id,
                      medicine_id: nearbyMedId,
                      medicine_name: nearbyResults?.medicine?.name,
                      unit: nearbyResults?.medicine?.unit,
                      suggested_quantity: donor.spareable_surplus,
                      cold_chain_flag: nearbyResults?.medicine?.cold_chain_flag
                    });
                  }}
                  height="450px"
                />
              </div>

              {/* Right Column: Nearest Ranked Surplus Centres Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Surplus Facilities (Nearest First)
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {nearbyResults?.results?.length || 0} candidate PHCs
                  </span>
                </div>

                <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1">
                  {nearbyResults?.results?.map((res, idx) => (
                    <div
                      key={res.phc_id}
                      className={`rounded-2xl border p-4 transition flex flex-col justify-between gap-3 ${
                        idx === 0
                          ? 'border-emerald-300 bg-emerald-50/40 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm">{res.phc_name}</span>
                            {idx === 0 && (
                              <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                                #1 Nearest Surplus
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {res.block} &bull; Phone: {res.phone}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-black text-teal-800">{res.distance_km} km</div>
                          <div className="text-[10px] text-slate-500 font-medium">~{res.estimated_minutes} min drive</div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-100/80 text-xs">
                        <div>
                          <span className="text-slate-500 font-medium">Spareable Surplus: </span>
                          <span className="font-extrabold text-slate-900">{res.spareable_surplus} units</span>
                          <span className="text-[11px] text-slate-400 font-normal"> (Total: {res.current_stock})</span>
                        </div>

                        <button
                          onClick={() => {
                            setTransferModalData({
                              source_phc_id: res.phc_id,
                              dest_phc_id: currentUser.phc_id,
                              medicine_id: nearbyMedId,
                              medicine_name: nearbyResults?.medicine?.name,
                              unit: nearbyResults?.medicine?.unit,
                              suggested_quantity: res.spareable_surplus,
                              cold_chain_flag: nearbyResults?.medicine?.cold_chain_flag
                            });
                          }}
                          className="rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-teal-700 shadow-2xs transition"
                        >
                          Request Transfer
                        </button>
                      </div>
                    </div>
                  ))}
                  {nearbyResults?.results?.length === 0 && (
                    <div className="text-center py-12 text-xs text-slate-400">
                      No nearby surplus found within radius. Submit an Emergency Indent to the District Warehouse.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 5: TRANSFERS & EMERGENCY INDENTS WORKFLOW             */}
        {/* ========================================================= */}
        {activeTab === 'transfers' && (
          <div className="space-y-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Inter-PHC Transfers & District Indents</h3>
                  <p className="text-xs text-slate-500">
                    Track transfer workflow: Requested &rarr; Approved &rarr; In Transit &rarr; Received &rarr; Completed.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTransferModalData({ dest_phc_id: currentUser.phc_id })}
                    className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-teal-700 shadow-sm transition"
                  >
                    <PlusCircle size={14} /> New Transfer Request
                  </button>
                </div>
              </div>

              {/* Transfers Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Ref & Medicine</th>
                      <th className="py-3 px-4">Route (Source &rarr; Dest)</th>
                      <th className="py-3 px-4">Transfer Quantity</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {transfers.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-mono text-[11px] font-bold text-slate-500">{t.req_number}</div>
                          <div className="font-bold text-slate-900 text-sm mt-0.5">{t.medicine_name}</div>
                          <div className="text-[11px] text-slate-400">{t.reason}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-xs text-slate-700">
                            <b>From:</b> {t.source_phc_name}
                          </div>
                          <div className="text-xs text-slate-900 font-bold mt-0.5">
                            <b>To:</b> {t.dest_phc_name}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-black text-slate-900 text-sm">{t.quantity}</span>{' '}
                          <span className="text-slate-500 text-xs">{t.unit}</span>
                          {Boolean(t.cold_chain_flag) && (
                            <div className="text-[10px] text-blue-600 font-bold mt-0.5">❄️ Cold-chain sealed</div>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                              t.status === 'requested'
                                ? 'bg-amber-100 text-amber-800'
                                : t.status === 'approved'
                                ? 'bg-blue-100 text-blue-800'
                                : t.status === 'in_transit'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {t.status.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {/* Medical Officer Approval */}
                            {t.status === 'requested' && (
                              <button
                                onClick={() => handleUpdateTransferStatus(t.id, 'approved')}
                                className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 transition"
                              >
                                Approve Transfer
                              </button>
                            )}

                            {/* Dispatch */}
                            {t.status === 'approved' && (
                              <button
                                onClick={() => handleUpdateTransferStatus(t.id, 'in_transit')}
                                className="rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700 transition"
                              >
                                Dispatch In Transit
                              </button>
                            )}

                            {/* Complete Receipt */}
                            {t.status === 'in_transit' && (
                              <button
                                onClick={() => handleUpdateTransferStatus(t.id, 'completed')}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                              >
                                Confirm Received
                              </button>
                            )}

                            {/* View / Print Transfer Slip */}
                            <button
                              onClick={() => handleOpenTransferSlip(t.id)}
                              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition flex items-center gap-1"
                            >
                              <Printer size={13} /> Slip
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {transfers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-xs text-slate-400">
                          No transfer requests recorded yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Emergency Indents Section */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">District Warehouse Emergency Indents</h3>
                  <p className="text-xs text-slate-500">Orders placed outside standard monthly cycle.</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Indent No & Item</th>
                      <th className="py-3 px-4">Health Centre</th>
                      <th className="py-3 px-4">Requested Qty</th>
                      <th className="py-3 px-4">Reason</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {indents.map((ind) => (
                      <tr key={ind.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3.5 px-4">
                          <div className="font-mono text-[11px] font-bold text-slate-500">{ind.indent_number}</div>
                          <div className="font-bold text-slate-900 text-sm mt-0.5">{ind.medicine_name}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-800">{ind.phc_name}</td>
                        <td className="py-3.5 px-4 font-black text-slate-900 text-sm">
                          {ind.requested_quantity} <span className="font-normal text-xs text-slate-500">{ind.unit}</span>
                        </td>
                        <td className="py-3.5 px-4 text-slate-600 max-w-xs truncate">{ind.reason}</td>
                        <td className="py-3.5 px-4">
                          <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-800">
                            {ind.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: AI FORECAST & INSIGHTS                             */}
        {/* ========================================================= */}
        {activeTab === 'ai_insights' && (
          <div className="space-y-6">
            {/* Top AI Redistribution Recommendations */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
                  <Sparkles size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    AI Redistribution Recommender (Multi-Objective Optimization)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Calculated matching considering Shortage Urgency, Surplus Volume, Haversine Distance, and Near-Expiry (FEFO).
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-2xl border border-teal-200 bg-teal-50/30 p-4 flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">
                          {rec.urgency} SHORTAGE
                        </span>
                        <span className="text-xs font-extrabold text-teal-800 bg-teal-100 px-2 py-0.5 rounded-full">
                          AI Match Score: {rec.best_match.recommendation_score}/100
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm">{rec.medicine_name}</h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{rec.ai_rationale}</p>
                    </div>

                    <div className="pt-2 border-t border-teal-100 flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-slate-500">Suggested: </span>
                        <span className="font-extrabold text-slate-900">
                          {rec.best_match.proposed_transfer_quantity} {rec.unit}
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          setTransferModalData({
                            source_phc_id: rec.best_match.source_phc_id,
                            dest_phc_id: rec.destination_phc_id,
                            medicine_id: rec.medicine_id,
                            medicine_name: rec.medicine_name,
                            unit: rec.unit,
                            suggested_quantity: rec.best_match.proposed_transfer_quantity,
                            cold_chain_flag: rec.cold_chain_flag
                          });
                        }}
                        className="rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-teal-700 transition"
                      >
                        Accept & Create Transfer
                      </button>
                    </div>
                  </div>
                ))}
                {recommendations.length === 0 && (
                  <div className="col-span-2 text-center py-8 text-xs text-slate-400">
                    No active shortages requiring emergency redistribution recommendations.
                  </div>
                )}
              </div>
            </div>

            {/* Z-Score Anomaly Detector Table */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-600" />
                Z-Score Consumption Anomaly Surveillance
              </h3>
              <p className="text-xs text-slate-500">
                Flags days where dispensing spiked &gt;2 standard deviations above the 30-day baseline mean.
              </p>

              <div className="space-y-3">
                {anomalies.map((anom, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{anom.phc_name}</span>
                        <span className="text-slate-400">&bull;</span>
                        <span className="font-bold text-amber-900">{anom.medicine_name}</span>
                        <span className="bg-amber-200 text-amber-950 font-mono font-bold px-1.5 py-0.5 rounded text-[10px]">
                          Z-Score: +{anom.z_score}
                        </span>
                      </div>
                      <p className="text-slate-600 mt-1">{anom.explanation}</p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-slate-900">{anom.dispensed} units dispensed</div>
                      <div className="text-[10px] text-slate-500">Baseline mean: {anom.mean}/day</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Consolidated Multi-Medicine Delivery Routes */}
            {consolidatedRoutes.length > 0 && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Truck size={18} className="text-teal-600" />
                  Consolidated Multi-Medicine Delivery Routes
                </h3>
                <p className="text-xs text-slate-500">
                  Groups multiple shortage medicines from the same donor PHC into a single consolidated delivery route.
                </p>

                <div className="space-y-3">
                  {consolidatedRoutes.map((cr, idx) => (
                    <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2">
                      <div className="flex items-center justify-between font-bold text-slate-900">
                        <span>
                          Trip: {cr.source_phc_name} &rarr; {cr.destination_phc_name}
                        </span>
                        <span className="text-teal-700">
                          {cr.crow_distance_km} km (~{cr.estimated_travel_minutes} mins)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {cr.items.map((item, i) => (
                          <span
                            key={i}
                            className="bg-white border border-slate-200 px-2 py-1 rounded font-semibold text-slate-800"
                          >
                            {item.medicine_name}: <b>{item.quantity} {item.unit}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 7: REPORTS & RISK MAP                                 */}
        {/* ========================================================= */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            {/* District Summary Dashboard Card */}
            {districtSummary && (
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">District Executive Overview</h3>
                    <p className="text-xs text-slate-500">{districtSummary.district_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="/api/reports/export-csv?type=stock"
                      target="_blank"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                    >
                      Export Stock CSV
                    </a>
                    <a
                      href="/api/reports/export-csv?type=alerts"
                      target="_blank"
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition shadow-2xs"
                    >
                      Export Alerts CSV
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500 font-medium">Total Health Centres</div>
                    <div className="text-xl font-black text-slate-900 mt-1">{districtSummary.total_phcs} PHCs</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500 font-medium">District Stock-Outs</div>
                    <div className="text-xl font-black text-red-600 mt-1">{districtSummary.total_stockouts} items</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500 font-medium">Near-Expiry (&lt;60d)</div>
                    <div className="text-xl font-black text-amber-600 mt-1">{districtSummary.near_expiry_count} batches</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-xs text-slate-500 font-medium">Avg Response Time</div>
                    <div className="text-xl font-black text-teal-700 mt-1">
                      {districtSummary.avg_redistribution_response_hours} hrs
                    </div>
                  </div>
                </div>

                {/* Block Risk Breakdown Table */}
                <div className="mt-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2">
                    Block Risk Assessment
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Block Name</th>
                          <th className="py-2.5 px-3">PHCs Count</th>
                          <th className="py-2.5 px-3">Critical Risk PHCs</th>
                          <th className="py-2.5 px-3">Moderate Risk PHCs</th>
                          <th className="py-2.5 px-3">Overall Block Risk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {districtSummary.block_risk_breakdown?.map((b, idx) => (
                          <tr key={idx}>
                            <td className="py-2.5 px-3 font-bold text-slate-900">{b.block}</td>
                            <td className="py-2.5 px-3">{b.phc_count}</td>
                            <td className="py-2.5 px-3 text-red-600 font-bold">{b.red_risk_phcs}</td>
                            <td className="py-2.5 px-3 text-amber-600 font-bold">{b.amber_risk_phcs}</td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                b.overall_risk === 'HIGH'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {b.overall_risk} RISK
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 3. MODAL POPUPS */}
      {selectedMedicineForDetail && (
        <MedicineDetailModal
          medicine={selectedMedicineForDetail}
          phcId={currentUser.phc_id}
          onClose={() => setSelectedMedicineForDetail(null)}
          onFindSurplus={(med) => {
            setNearbyMedId(med.medicine_id);
            setActiveTab('nearby_finder');
          }}
          onDraftIndent={(med) => {
            setAutoIndentModalData(med);
          }}
        />
      )}

      {transferModalData && (
        <RequestTransferModal
          initialData={transferModalData}
          phcs={phcs}
          onClose={() => setTransferModalData(null)}
          onSuccess={() => {
            fetchData();
            setActiveTab('transfers');
          }}
        />
      )}

      {autoIndentModalData && (
        <AutoDraftIndentModal
          initialMedicine={autoIndentModalData}
          phcId={currentUser.phc_id}
          onClose={() => setAutoIndentModalData(null)}
          onSuccess={() => {
            fetchData();
            setActiveTab('transfers');
          }}
        />
      )}

      {slipModalData && (
        <TransferSlipModal
          slipData={slipModalData}
          onClose={() => setSlipModalData(null)}
        />
      )}

      {showChatbot && (
        <StaffChatbotModal
          phcId={currentUser.phc_id}
          lang={lang}
          onClose={() => setShowChatbot(false)}
        />
      )}
    </div>
  );
}
