import { useState, useEffect } from 'react';
import { Search, MapPin, Phone, Building, CheckCircle2, AlertTriangle, XCircle, ArrowLeft, HeartPulse, Globe } from 'lucide-react';
import { api } from '../utils/api';
import { Link } from 'react-router-dom';

export default function PublicAvailabilityPage({ lang = 'en', onToggleLang }) {
  const [phcs, setPhcs] = useState([]);
  const [selectedPhcId, setSelectedPhcId] = useState('phc-thiruporur');
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getPhcs().then(setPhcs).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedPhcId) return;
    setLoading(true);
    api.getPublicAvailability(selectedPhcId, search)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedPhcId, search]);

  const isTamil = lang === 'ta';

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white font-bold shadow-sm">
              <HeartPulse size={22} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 tracking-tight">
                {isTamil ? 'மருந்து இருப்பு பொது தகவல்' : 'Public Medicine Stock Directory'}
              </h1>
              <p className="text-xs text-slate-500">
                {isTamil ? 'தமிழ்நாடு பொது சுகாதாரத் துறை &bull; செங்கல்பட்டு மாவட்டம்' : 'Dept of Public Health &bull; Chengalpattu Health District, Tamil Nadu'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleLang}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              <Globe size={14} /> {isTamil ? 'English' : 'தமிழ் (Tamil)'}
            </button>
            <Link
              to="/app"
              className="flex items-center gap-1 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-black transition shadow-sm"
            >
              Staff Portal Login
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Banner */}
        <div className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-emerald-50/40 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-teal-950">
            {isTamil ? 'உங்கள் ஆரம்ப சுகாதார நிலையத்தில் மருந்து உள்ளதா என அறியலாம்' : 'Check Medicine Availability at your Nearest Primary Health Centre'}
          </h2>
          <p className="text-xs text-teal-800/90 mt-1 max-w-3xl leading-relaxed">
            {isTamil
              ? 'பொதுமக்கள் ஆரம்ப சுகாதார நிலையத்திற்கு நேரில் செல்வதற்கு முன் தேவையான அத்தியாவசிய மருந்துகள் இருப்பில் உள்ளதா என்பதை வெளிப்படையாக சரிபார்க்கலாம். தனிப்பட்ட நோயாளி தகவல்கள் எதுவும் சேமிக்கப்படுவதில்லை.'
              : 'Citizens can check the real-time categorical availability of essential government medicines before visiting the PHC. This portal shows general stock status (Available, Low Stock, or Out of Stock) to ensure timely care.'}
          </p>
        </div>

        {/* Filters Box */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {isTamil ? 'ஆரம்ப சுகாதார நிலையத்தைத் தேர்ந்தெடுக்கவும்' : 'Select Primary Health Centre (PHC)'}
            </label>
            <select
              value={selectedPhcId}
              onChange={(e) => setSelectedPhcId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs font-semibold text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-none"
            >
              {phcs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.block})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              {isTamil ? 'மருந்தின் பெயர் அல்லது வகையைத் தேடவும்' : 'Search Medicine Name or Generic'}
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isTamil ? 'உதா: Paracetamol, ORS, Amoxicillin, Insulin...' : 'e.g., Paracetamol, ORS, Amoxicillin, Insulin...'}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3.5 py-2.5 text-xs text-slate-800 focus:border-teal-500 focus:bg-white focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Selected PHC Info Banner */}
        {data?.phc && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building size={16} className="text-teal-600" />
                {data.phc.name}
              </div>
              <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                <MapPin size={13} className="text-slate-400" />
                {data.phc.address || `${data.phc.block}, Chengalpattu District`}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <Phone size={13} className="text-teal-600" />
              {data.phc.phone}
            </div>
          </div>
        )}

        {/* Medicine Availability Cards */}
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">Loading medicine availability...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.results?.map((med) => {
              const isAvailable = med.badge_color === 'green';
              const isLow = med.badge_color === 'amber';
              const isOut = med.badge_color === 'red';

              return (
                <div
                  key={med.medicine_id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {med.category}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                          isAvailable
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : isLow
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {isAvailable && <CheckCircle2 size={12} />}
                        {isLow && <AlertTriangle size={12} />}
                        {isOut && <XCircle size={12} />}
                        {isTamil ? med.public_status_tamil : med.public_status}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-slate-900 leading-snug">{med.medicine_name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{med.generic_name}</p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{med.form} &bull; {med.strength}</span>
                    <span className="font-semibold text-slate-700">Free Gov Supply</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
