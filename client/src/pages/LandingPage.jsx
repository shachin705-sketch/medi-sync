import { ArrowRight, BellRing, ShieldCheck, Route, TrendingDown, HeartPulse, Activity, CheckCircle2, Crosshair, MapPinned, Gauge } from 'lucide-react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

const hints = [
  { icon: Gauge, title: 'Stock vs rate', text: 'A falling number is not the same as a fast-falling rate. The system watches both.', tone: 'teal' },
  { icon: MapPinned, title: 'Shortage next to surplus', text: 'Three centres had more than they needed, nine kilometres away. The old system only ordered from the top.', tone: 'amber' },
  { icon: Route, title: 'Top-down only', text: 'The indent only goes to the district on the 1st. Local decisions were slower and harder to see.', tone: 'danger' }
];

const steps = [
  { name: 'Update', icon: Activity, desc: 'This block keeps medicine and batch data fresh in one place.' },
  { name: 'Detect', icon: BellRing, desc: 'Forecasts show risk before stockout and point to the next critical day.' },
  { name: 'Match', icon: Crosshair, desc: 'Nearby centres are ranked by expiry, distance and donor safety.' },
  { name: 'Resolve', icon: ShieldCheck, desc: 'The officer approves only what is safe and allowed.' }
];

const mapping = [
  ['Track stock across centres', 'Block map dashboard'],
  ['Forecast what will run out and when', 'Centre detail with 7-day forecast'],
  ['Raise early alerts before new stock arrives', 'Alerts panel + early warning'],
  ['Show which centres need what and how urgently', 'Needs board and urgency pills'],
  ['Block Exchange extension', 'Local transfer, donor checks and district escalation']
];

const impact = [
  { label: 'Critical centres found before stockout', value: '3 / 10', note: 'Simulated' },
  { label: 'Average alert-to-recommendation time', value: '6 days', note: 'Simulated' },
  { label: 'Local transfer fit success', value: '87%', note: 'Simulated' }
];

function LandingPage() {
  return (
    <div className="bg-paper text-ink">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal text-lg font-semibold text-white">V</div>
          <div>
            <div className="font-serif text-2xl leading-none">VelocityRx</div>
            <div className="text-xs uppercase tracking-[0.22em] text-slate-500">+ Block Exchange</div>
          </div>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-slate-600 md:flex">
          <a href="#story">Story</a>
          <a href="#process">How it works</a>
          <a href="#safety">Safety</a>
          <a href="#impact">Impact</a>
        </nav>
        <Link to="/app" className="inline-flex items-center gap-2 rounded-full bg-teal px-5 py-2.5 text-sm font-medium text-white shadow-soft transition hover:bg-[#0a5a5a]">Open live demo <ArrowRight size={16} /></Link>
      </header>

      <main>
        <section id="story" className="mx-auto max-w-7xl px-6 py-8 md:py-14">
          <div className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                <HeartPulse className="h-4 w-4 text-teal" />
                Fictional sample data - decision support only
              </div>
              <h1 className="max-w-xl font-serif text-5xl leading-[1.04] tracking-tight md:text-7xl">
                The medicine was nine kilometres away the whole time.
              </h1>
              <p className="mt-6 max-w-xl text-lg text-slate-700">
                A mother walks six kilometres with a feverish child. The paracetamol syrup ran out, but no one noticed the rate problem until it was too late.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link to="/app" className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 font-medium text-white shadow-soft hover:bg-[#d14f00]">Open live demo <ArrowRight size={18} /></Link>
                <a href="#process" className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 font-medium text-slate-700">See how it works</a>
              </div>
            </div>

            <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white p-6 shadow-soft">
              <div className="mb-5 flex items-center justify-between">
                <div className="text-sm font-medium text-slate-500">Block A–J map</div>
                <div className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-700">Critical</div>
              </div>
              <div className="relative h-[260px] overflow-hidden rounded-[18px] border border-slate-200 bg-[radial-gradient(circle_at_top,#f5f5f0,#f3efe9_55%,#ece7de)]">
                <div className="absolute left-8 top-16 h-20 w-20 rounded-full border border-slate-200 bg-slate-50" />
                <div className="absolute right-12 top-14 h-24 w-20 rounded-b-full border border-slate-200 bg-slate-100" />
                <div className="absolute bottom-7 left-8 h-20 w-36 rounded-full border border-slate-200 bg-slate-50" />
                <div className="absolute inset-0">
                  <svg viewBox="0 0 480 260" className="h-full w-full">
                    <path d="M80 170 C 160 100, 220 160, 300 120 S 390 80, 430 150" stroke="#C7C0B3" strokeWidth="2.2" fill="none" strokeDasharray="8 8" />
                    <path d="M70 120 C 150 80, 220 120, 300 90 S 390 60, 440 120" stroke="#C7C0B3" strokeWidth="2.2" fill="none" strokeDasharray="8 8" />
                    <path d="M200 40 L 210 220" stroke="#C7C0B3" strokeWidth="1.5" strokeDasharray="10 10" opacity="0.6" />
                    <circle cx="140" cy="145" r="18" fill="#D62839" />
                    <circle cx="330" cy="110" r="18" fill="#2E9E5B" />
                    <path d="M140 145 C 220 130, 260 125, 330 110" stroke="#0B6E6E" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <circle cx="220" cy="130" r="4" fill="#0B6E6E" />
                  </svg>
                </div>
                <div className="absolute left-4 top-3 rounded-full bg-white px-2 py-1 text-[10px] font-medium text-slate-600 shadow-sm">9 km · 22 min</div>
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-2 text-[10px] font-medium text-slate-700 shadow-sm">Centre A → Centre B</div>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-10">
          <div className="grid gap-5 md:grid-cols-3">
            {hints.map(({ icon: Icon, title, text, tone }) => (
              <motion.article key={title} whileHover={{ y: -4 }} transition={{ duration: 0.18 }} className="rounded-[20px] border border-slate-200 bg-white p-6 shadow-soft">
                <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-${tone}-50 text-${tone}-600`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 font-serif text-2xl">{title}</h3>
                <p className="text-slate-700">{text}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section id="process" className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-8 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">How it works</p>
            <h2 className="mt-3 font-serif text-4xl md:text-5xl">Block Exchange helps the right centres act early.</h2>
          </div>
          <div className="grid gap-5 md:grid-cols-4">
            {steps.map(({ name, icon: Icon, desc }, idx) => (
              <div key={name} className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-soft">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EAF4F4] text-teal">
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-slate-400">0{idx + 1}</span>
                </div>
                <div className="mb-2 text-lg font-semibold">{name}</div>
                <p className="text-slate-700">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-14">
          <div className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-soft">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">Problem statement</p>
                <h3 className="mt-2 font-serif text-4xl">Mapped to the actual screens</h3>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {mapping.map(([label, screen]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-[#FBF8F4] p-4">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Requirement</div>
                  <p className="font-medium text-slate-800">{label}</p>
                  <div className="mt-3 inline-flex rounded-full border border-teal/30 bg-teal/5 px-2 py-1 text-xs font-medium text-teal">{screen}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="safety" className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-7 md:grid-cols-2">
            <div className="rounded-[28px] border border-slate-200 bg-white p-7 shadow-soft">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">Safety and trust</p>
              <h3 className="mt-2 font-serif text-4xl">Every recommendation is checked before it reaches the field.</h3>
              <ul className="mt-6 space-y-4 text-slate-700">
                <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 text-success" /> Safety stock is protected before a donor can send stock.</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 text-success" /> FEFO expiry rules cap or reject unsafe batches.</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 text-success" /> Only the Block Officer can approve transfers.</li>
                <li className="flex gap-3"><CheckCircle2 className="mt-1 h-5 w-5 text-success" /> Each state change is logged in an audit trail.</li>
              </ul>
            </div>
            <div className="rounded-[28px] border border-slate-200 bg-[#EAF4F4] p-7 shadow-soft">
              <div className="mb-6 flex items-center gap-3 text-teal"><ShieldCheck className="h-6 w-6" /><span className="font-semibold">Decision-support prototype</span></div>
              <p className="text-slate-700">VelocityRx + Block Exchange is a prototype for planning support. It does not replace official procurement rules, clinical decisions or state transfer policy.</p>
              <div className="mt-6 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700">
                Forecasts are labelled “Simulated” and based on a 7-day moving average + linear trend with visible backtest. This is not a claim of real-world effectiveness.
              </div>
            </div>
          </div>
        </section>

        <section id="impact" className="mx-auto max-w-7xl px-6 py-14">
          <div className="mb-6 text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal">Impact measures</p>
            <h3 className="mt-3 font-serif text-4xl">Simulated results from the prototype</h3>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {impact.map(({ label, value, note }) => (
              <div key={label} className="rounded-[24px] border border-slate-200 bg-white p-6 text-center shadow-soft">
                <div className="font-serif text-5xl text-teal">{value}</div>
                <div className="mt-3 text-slate-700">{label}</div>
                <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">{note}</div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm font-medium text-slate-700">
            {['SDG 3', 'SDG 9', 'SDG 10', 'SDG 12'].map((chip) => (
              <span key={chip} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">{chip}</span>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-[#F5F1EA]">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <div>Fictional sample data - decision support only</div>
          <div className="max-w-2xl text-right">Decision-support prototype, not a replacement for official procurement, clinical decisions or government stock-transfer rules. Fictional data.</div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
