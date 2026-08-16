import { useEffect, useState } from 'preact/hooks';

const TRIP_DATA = [
 { day: 'Fri', date: 'Aug 14', temp: 24, tempF: 75, tides: [{ time: '6:48am', val: 6.8, h: 4.5 }, { time: '8:17pm', val: 20.28, h: 5.0 }] },
 { day: 'Sat', date: 'Aug 15', temp: 23, tempF: 73, tides: [{ time: '7:49am', val: 7.82, h: 4.3 }, { time: '8:45pm', val: 20.75, h: 4.9 }] },
 { day: 'Sun', date: 'Aug 16', temp: 22, tempF: 72, tides: [{ time: '8:52am', val: 8.87, h: 4.1 }, { time: '9:12pm', val: 21.2, h: 4.8 }] },
 { day: 'Mon', date: 'Aug 17', temp: 22, tempF: 72, tides: [{ time: '10:01am', val: 10.02, h: 4.0 }, { time: '9:36pm', val: 21.6, h: 4.7 }] },
 { day: 'Tue', date: 'Aug 18', temp: 22, tempF: 72, tides: [{ time: '11:17am', val: 11.28, h: 4.0 }, { time: '9:58pm', val: 21.97, h: 4.5 }] },
 { day: 'Wed', date: 'Aug 19', temp: 21, tempF: 70, tides: [{ time: '12:42pm', val: 12.7, h: 4.0 }, { time: '10:19pm', val: 22.32, h: 4.3 }] },
 { day: 'Thu', date: 'Aug 20', temp: 21, tempF: 70, tides: [{ time: '2:15pm', val: 14.25, h: 4.1 }, { time: '10:42pm', val: 22.7, h: 4.2 }] },
 { day: 'Fri', date: 'Aug 21', temp: 21, tempF: 70, tides: [{ time: '3:35pm', val: 15.58, h: 4.3 }, { time: '11:17pm', val: 23.28, h: 4.0 }] },
 { day: 'Sat', date: 'Aug 22', temp: 21, tempF: 70, tides: [{ time: '4:29pm', val: 16.48, h: 4.4 }] },
 { day: 'Sun', date: 'Aug 23', temp: 21, tempF: 70, note: 'Est.', tides: [{ time: '12:28am', val: 0.47, h: 3.9 }, { time: '5:09pm', val: 17.15, h: 4.5 }] },
];

const AXIS_LABELS = ['12 AM', '6 AM', '12 PM', '6 PM', '12 AM'];
const MINI_AXIS_LABELS = ['12a', '6a', '12p', '6p', '12a'];

// All trip dates fall in August 2026 — a fixed month map keeps ISO conversion trivial and avoids Date-parsing TZ bugs.
const TRIP_YEAR = 2026;
const MONTH_NUM = { Aug: '08' };
const toISODate = (dateStr) => {
 const [mon, day] = dateStr.split(' ');
 return `${TRIP_YEAR}-${MONTH_NUM[mon]}-${day.padStart(2, '0')}`;
};

const COMOX_LAT = 49.6734;
const COMOX_LON = -124.928;
const COMOX_TZ = 'America/Vancouver';

function useLiveTemps() {
 const [temps, setTemps] = useState({});
 const [updatedAt, setUpdatedAt] = useState(null);

 useEffect(() => {
 let cancelled = false;

 async function fetchRange(baseUrl, startISO, endISO) {
 const url = `${baseUrl}?latitude=${COMOX_LAT}&longitude=${COMOX_LON}&start_date=${startISO}&end_date=${endISO}&daily=temperature_2m_max&timezone=${encodeURIComponent(COMOX_TZ)}`;
 const res = await fetch(url);
 if (!res.ok) return {};
 const json = await res.json();
 const out = {};
 json.daily.time.forEach((date, i) => {
 out[date] = json.daily.temperature_2m_max[i];
 });
 return out;
 }

 async function load() {
 try {
 const isoDates = TRIP_DATA.map((d) => toISODate(d.date));
 const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: COMOX_TZ });
 const pastDates = isoDates.filter((d) => d < todayISO);
 const futureDates = isoDates.filter((d) => d >= todayISO);

 const [pastResults, futureResults] = await Promise.all([
 pastDates.length
 ? fetchRange('https://archive-api.open-meteo.com/v1/archive', pastDates[0], pastDates[pastDates.length - 1])
 : {},
 futureDates.length
 ? fetchRange('https://api.open-meteo.com/v1/forecast', futureDates[0], futureDates[futureDates.length - 1])
 : {},
 ]);

 if (cancelled) return;
 const merged = { ...pastResults, ...futureResults };
 if (Object.keys(merged).length) {
 setTemps(merged);
 setUpdatedAt(new Date());
 }
 } catch {
 // Network error or API outage — keep the static fallback values, don't surface an error UI.
 }
 }

 load();
 return () => {
 cancelled = true;
 };
 }, []);

 return { temps, updatedAt };
}

// Semi-diurnal (M2) tides run ~12.4h between successive highs — used only to shape an
// illustrative curve, not to predict real tide times/heights (we have no CHS API access).
const TIDE_PERIOD_H = 12.4;
const LOW_TIDE_DROP = 3.2;
const MIN_LOW_HEIGHT = 0.6;

// Highs bracketing this day's [0, 24] window, including the neighboring days' nearest
// high so the curve extrapolates smoothly across midnight instead of flattening at the edges.
function tideAnchors(days, idx) {
 const day = days[idx];
 const own = day.tides.map((t) => ({ t: t.val, h: t.h }));
 const prevLast = days[idx - 1]?.tides.at(-1);
 const nextFirst = days[idx + 1]?.tides[0];
 const prevAnchor = prevLast
 ? { t: prevLast.val - 24, h: prevLast.h }
 : { t: own[0].t - TIDE_PERIOD_H, h: own[0].h };
 const nextAnchor = nextFirst
 ? { t: nextFirst.val + 24, h: nextFirst.h }
 : { t: own.at(-1).t + TIDE_PERIOD_H, h: own.at(-1).h };
 return [prevAnchor, ...own, nextAnchor];
}

// Height between two known highs: a raised-cosine descent to an estimated trough at the
// midpoint, then a raised-cosine ascent back up — smooth, continuous, and passes exactly
// through each known high.
function tideHeightAt(anchors, t) {
 for (let i = 0; i < anchors.length - 1; i++) {
 const a = anchors[i], b = anchors[i + 1];
 if (t < a.t || t > b.t) continue;
 const mid = (a.t + b.t) / 2;
 const troughH = Math.max(MIN_LOW_HEIGHT, (a.h + b.h) / 2 - LOW_TIDE_DROP);
 if (t <= mid) {
 const frac = (t - a.t) / (mid - a.t || 1);
 return troughH + (a.h - troughH) * ((1 + Math.cos(Math.PI * frac)) / 2);
 }
 const frac = (t - mid) / (b.t - mid || 1);
 return troughH + (b.h - troughH) * ((1 - Math.cos(Math.PI * frac)) / 2);
 }
 return anchors[0].h;
}

// Diverging cool→warm color scale for the daily temp, blended in RGB (not hue-rotated)
// so the gradient never passes through green/yellow — stays a muted blue↔orange axis.
const COOL_RGB = [96, 165, 250]; // blue-400
const WARM_RGB = [234, 88, 12]; // orange-600
const LIGHTEN = 0.2; // pull toward white slightly, but keep the curve clearly visible against the background

function tempToColor(temp, minTemp, maxTemp) {
 const range = maxTemp - minTemp;
 const frac = range > 0 ? Math.min(1, Math.max(0, (temp - minTemp) / range)) : 0.5;
 const rgb = COOL_RGB.map((c, i) => {
 const mixed = c + (WARM_RGB[i] - c) * frac;
 return Math.round(mixed + (255 - mixed) * LIGHTEN);
 });
 return `rgb(${rgb.join(',')})`;
}

// SVG path (viewBox 0 0 1000 100) tracing the approximate tide curve across the day.
function sparklinePath(days, idx, samples = 96) {
 const anchors = tideAnchors(days, idx);
 const pts = Array.from({ length: samples + 1 }, (_, i) => {
 const t = (i / samples) * 24;
 return { t, h: tideHeightAt(anchors, t) };
 });
 const heights = pts.map((p) => p.h);
 const minH = Math.min(...heights);
 const range = Math.max(...heights) - minH || 1;
 const PAD = 10; // percent padding top/bottom so the curve doesn't touch the row edges
 const toX = (t) => ((t / 24) * 1000).toFixed(1);
 const toY = (h) => (100 - PAD - ((h - minH) / range) * (100 - 2 * PAD)).toFixed(1);
 return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.t)} ${toY(p.h)}`).join(' ');
}

export default function App() {
 const { temps: liveTemps, updatedAt } = useLiveTemps();

 // Define peak heat hours (1 PM to 5 PM) and buffer for tide overlap
 const HOT_START = 13;
 const HOT_END = 17;
 const TIDE_BUFFER = 1.5;

 const checkOverlap = (tideVal) => {
 return (tideVal - TIDE_BUFFER < HOT_END && tideVal + TIDE_BUFFER > HOT_START);
 };

 // Whichever temp is currently on display per day (live-fetched if available, static fallback
 // otherwise) — the color scale's min/max are derived from these, never hardcoded.
 const dayTemps = TRIP_DATA.map((day) => {
 const liveMax = liveTemps[toISODate(day.date)];
 return liveMax !== undefined ? Math.round(liveMax) : day.temp;
 });
 const minTemp = Math.min(...dayTemps);
 const maxTemp = Math.max(...dayTemps);

 return (
 <div className="min-h-screen bg-[#FDFDFD] text-slate-800 p-4 sm:p-12 font-sans flex justify-center">
 <div className="w-full max-w-3xl">

 {/* Header */}
 <header className="mb-6 sm:mb-16 border-b border-slate-200 pb-5 sm:pb-8">
 <h1 className="text-2xl sm:text-4xl font-semibold sm:font-light tracking-tight text-slate-900">Comox Planner</h1>
 <p className="text-slate-500 mt-1.5 sm:mt-2 text-xs sm:text-sm tracking-wide uppercase">August 14–23 • Tides & Peak Heat</p>
 {updatedAt && (
 <p className="text-slate-400 mt-2 text-[11px] sm:text-xs italic">
 Temps live as of {updatedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
 </p>
 )}
 </header>

 {/* Global Timeline Axis — sticky so it stays visible while scrolling a long list */}
 <div className="sticky top-0 z-20 bg-[#FDFDFD]/95 backdrop-blur-sm flex justify-between text-[11px] sm:text-[10px] font-semibold sm:font-medium text-slate-500 sm:ml-28 mb-4 sm:mb-6 px-1 py-2 border-b border-slate-100">
 {AXIS_LABELS.map((label, i) => <span key={i}>{label}</span>)}
 </div>

 <div className="space-y-7 sm:space-y-12">
 {TRIP_DATA.map((day, idx) => {
 const liveMax = liveTemps[toISODate(day.date)];
 const hasLive = liveMax !== undefined;
 const displayTemp = hasLive ? Math.round(liveMax) : day.temp;

 return (
 <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-6">

 {/* Date & Temp — full-width row on mobile so it can't wrap or misalign, sidebar column on desktop */}
 <div className="w-full sm:w-28 shrink-0 flex items-baseline justify-between sm:flex-col sm:items-start sm:justify-start gap-0">
 <span className="text-base sm:text-sm font-semibold sm:font-medium text-slate-900 whitespace-nowrap">{day.day}, {day.date}</span>
 <span className="text-sm sm:text-xs text-slate-500 sm:text-slate-400 font-medium sm:font-light tracking-wide whitespace-nowrap">
 {displayTemp}°C {day.note && !hasLive && <span className="ml-1 text-xs sm:text-[10px] italic">({day.note})</span>}
 </span>
 </div>

 {/* Timeline Bar */}
 <div className="flex-1">
 <div className="relative h-1 sm:h-[1px] bg-slate-200 rounded-full mt-8 sm:mt-0 mx-1 sm:mx-0">

 {/* Tide Sparkline — illustrative curve through the known high-tide points, not a real prediction */}
 <svg
 className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-7 sm:h-6 w-full overflow-visible"
 viewBox="0 0 1000 100"
 preserveAspectRatio="none"
 aria-hidden="true"
 >
 <path
 d={sparklinePath(TRIP_DATA, idx)}
 fill="none"
 stroke={tempToColor(dayTemps[idx], minTemp, maxTemp)}
 strokeWidth="3"
 vectorEffect="non-scaling-stroke"
 />
 </svg>

 {/* Heat Band */}
 <div
 className="absolute h-7 sm:h-6 bg-orange-200/80 top-1/2 -translate-y-1/2 transition-all duration-300 border-x-2 border-orange-400/70"
 style={{
 left: `${(HOT_START / 24) * 100}%`,
 width: `${((HOT_END - HOT_START) / 24) * 100}%`,
 borderRadius: '4px'
 }}
 />

 {/* Tide Markers */}
 {day.tides.map((tide, i) => {
 const isOverlapping = checkOverlap(tide.val);
 const leftPct = (tide.val / 24) * 100;
 // Near either edge, centering the label on the dot pushes it off-screen — anchor to the dot's edge instead.
 const labelAlign = leftPct < 8 ? 'left-0' : leftPct > 92 ? 'right-0' : 'left-1/2 -translate-x-1/2';

 return (
 <div
 key={i}
 className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center z-10"
 style={{ left: `${leftPct}%` }}
 >
 {/* Text Label */}
 <span className={`absolute bottom-5 sm:bottom-4 ${labelAlign} text-xs sm:text-[10px] tracking-wide font-semibold sm:font-medium whitespace-nowrap transition-colors
 ${isOverlapping ? 'text-red-600 sm:text-red-500' : 'text-blue-600 sm:text-blue-500'}`}>
 {tide.time}
 </span>

 {/* Status Dot */}
 <div className={`w-3.5 h-3.5 sm:w-2.5 sm:h-2.5 rounded-full ring-4 transition-all
 ${isOverlapping
 ? 'bg-red-500 ring-red-100'
 : 'bg-blue-500 ring-blue-100'}`}
 />
 </div>
 );
 })}
 </div>

 {/* Per-row mini axis — mobile only, so each row is readable without scrolling back to the header */}
 <div className="flex justify-between text-[10px] font-medium text-slate-400 mt-1.5 px-1 sm:hidden">
 {MINI_AXIS_LABELS.map((label, i) => <span key={i}>{label}</span>)}
 </div>
 </div>
 </div>
 );
 })}
 </div>

 {/* Legend/Footer */}
 <div className="mt-14 sm:mt-24 pt-8 border-t border-slate-100 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-xs text-slate-500 font-medium sm:font-light">
 <div className="flex items-center gap-2">
 <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div> Clear High Tide
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> Heat Overlap
 </div>
 <div className="flex items-center gap-2">
 <div className="w-4 h-4 rounded-sm bg-orange-200/80 border-2 border-orange-400/70"></div> Peak Heat (1PM - 5PM)
 </div>
 </div>
 <p className="mt-3 text-center text-[11px] sm:text-[10px] text-slate-400 italic">
 Tide curve is illustrative — not a precise tide prediction. Curve color = that day's temp (blue cooler → orange warmer).
 </p>

 </div>
 </div>
 );
}
