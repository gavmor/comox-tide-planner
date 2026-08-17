import { useEffect, useState } from 'preact/hooks';
import { getTimes as getSunTimes } from 'suncalc';

const TRIP_DATA = [
 { day: 'Fri', date: 'Aug 14', temp: 24, tempF: 75 },
 { day: 'Sat', date: 'Aug 15', temp: 23, tempF: 73 },
 { day: 'Sun', date: 'Aug 16', temp: 22, tempF: 72 },
 { day: 'Mon', date: 'Aug 17', temp: 22, tempF: 72 },
 { day: 'Tue', date: 'Aug 18', temp: 22, tempF: 72 },
 { day: 'Wed', date: 'Aug 19', temp: 21, tempF: 70 },
 { day: 'Thu', date: 'Aug 20', temp: 21, tempF: 70 },
 { day: 'Fri', date: 'Aug 21', temp: 21, tempF: 70 },
 { day: 'Sat', date: 'Aug 22', temp: 21, tempF: 70 },
 { day: 'Sun', date: 'Aug 23', temp: 21, tempF: 70 },
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

// Denman Island West ferry terminal (Buckley Bay <-> Denman Island route) — the trip's actual location.
const TRIP_LAT = 49.5344473;
const TRIP_LON = -124.823743;
const TRIP_TZ = 'America/Vancouver';

function decimalHourInTZ(date, timeZone) {
 const parts = new Intl.DateTimeFormat('en-US', {
 timeZone,
 hour: 'numeric',
 minute: 'numeric',
 hour12: false,
 }).formatToParts(date);
 const hour = Number(parts.find((p) => p.type === 'hour').value) % 24;
 const minute = Number(parts.find((p) => p.type === 'minute').value);
 return hour + minute / 60;
}

function formatTimeInTZ(date, timeZone) {
 return new Intl.DateTimeFormat('en-US', {
 timeZone,
 hour: 'numeric',
 minute: '2-digit',
 hour12: true,
 }).format(date).replace(' ', '').toLowerCase();
}

// Drives the "now" scrubber — ticks every 30s so the marker creeps across the row live,
// without a page reload, while staying cheap enough to leave running indefinitely.
function useNow(intervalMs = 30000) {
 const [now, setNow] = useState(() => new Date());
 useEffect(() => {
 const id = setInterval(() => setNow(new Date()), intervalMs);
 return () => clearInterval(id);
 }, [intervalMs]);
 return now;
}

// Sunrise/sunset are purely astronomical (date + lat/lon), unlike the live temps above —
// computed once at module load since TRIP_DATA's dates never change.
const DAYLIGHT = TRIP_DATA.map((day) => {
 const [y, m, d] = toISODate(day.date).split('-').map(Number);
 const noonUTC = new Date(Date.UTC(y, m - 1, d, 12));
 const { sunrise, sunset } = getSunTimes(noonUTC, TRIP_LAT, TRIP_LON);
 return {
 sunrise: decimalHourInTZ(sunrise, TRIP_TZ),
 sunset: decimalHourInTZ(sunset, TRIP_TZ),
 };
});

function useLiveTemps() {
 const [temps, setTemps] = useState({});
 const [updatedAt, setUpdatedAt] = useState(null);

 useEffect(() => {
 let cancelled = false;

 async function fetchRange(baseUrl, startISO, endISO) {
 const url = `${baseUrl}?latitude=${TRIP_LAT}&longitude=${TRIP_LON}&start_date=${startISO}&end_date=${endISO}&daily=temperature_2m_max&timezone=${encodeURIComponent(TRIP_TZ)}`;
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
 const todayISO = new Date().toLocaleDateString('en-CA', { timeZone: TRIP_TZ });
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

const TIDE_CURVE_COLOR = '#94a3b8'; // slate-400 — fixed, not tied to any data value

// CHS/IWLS station "Denman Island" (07955) — sits ~200m from TRIP_LAT/TRIP_LON, the closest
// official predicted-tide station to the ferry terminal. Its "wlp-hilo" series is CHS's
// harmonic-model high/low predictions (not a live gauge — this station doesn't have one),
// which is exactly what a forward-dated trip itinerary needs.
const TIDE_STATION_ID = '5cebf1de3d0f4a073c4bb977';
const TIDE_API_BASE = 'https://api-iwls.dfo-mpo.gc.ca/api/v1';

// America/Vancouver sits at fixed UTC-7 (PDT) for the entire trip window — no DST transition
// to account for — so local midnight can be computed directly instead of via Intl round-tripping.
const VANCOUVER_UTC_OFFSET_H = 7;
function localMidnightUTCms(isoDate) {
 const [y, m, d] = isoDate.split('-').map(Number);
 return Date.UTC(y, m - 1, d, VANCOUVER_UTC_OFFSET_H, 0, 0);
}

// Integer day offset from the trip's first day, computed via noon-UTC subtraction (like
// DAYLIGHT above) so it's immune to any single hour of DST drift — lets buffer days fetched
// before/after the trip (idx < 0 or idx >= TRIP_DATA.length) slot into the same numeric axis.
function dayIndexForDate(date) {
 const isoDate = date.toLocaleDateString('en-CA', { timeZone: TRIP_TZ });
 const [y, m, d] = isoDate.split('-').map(Number);
 const [y0, m0, d0] = toISODate(TRIP_DATA[0].date).split('-').map(Number);
 return Math.round((Date.UTC(y, m - 1, d, 12) - Date.UTC(y0, m0 - 1, d0, 12)) / 86400000);
}

// Fetches real CHS high/low tide predictions for the trip window (plus a day of buffer on
// each side so every day's sparkline has a real anchor to extrapolate toward across midnight).
// Deterministic, government-published data — same output every time, but fetched client-side
// (rather than baked in at build time) because CORS is wide open (access-control-allow-origin: *)
// and this keeps the pattern consistent with useLiveTemps above.
function useTideData() {
 const [state, setState] = useState({ status: 'loading', anchors: null });

 useEffect(() => {
 let cancelled = false;

 async function load() {
 try {
 const fromMs = localMidnightUTCms(toISODate(TRIP_DATA[0].date)) - 24 * 3600 * 1000;
 const toMs = localMidnightUTCms(toISODate(TRIP_DATA.at(-1).date)) + 2 * 24 * 3600 * 1000;
 const url = `${TIDE_API_BASE}/stations/${TIDE_STATION_ID}/data?time-series-code=wlp-hilo&from=${new Date(fromMs).toISOString()}&to=${new Date(toMs).toISOString()}`;
 const res = await fetch(url);
 if (!res.ok) throw new Error(`CHS IWLS API ${res.status}`);
 const raw = await res.json();
 if (!raw.length) throw new Error('CHS IWLS API returned no tide events');

 // wlp-hilo returns only extrema (alternating highs/lows), one per event, already in
 // chronological order — determine the first point's type by comparing it to the second,
 // then simply alternate for the rest.
 const points = raw.map((r) => ({ date: new Date(r.eventDate), h: r.value }));
 const firstIsHigh = points[0].h >= points[1].h;
 const anchors = points
 .map((p, i) => {
 const dayIdx = dayIndexForDate(p.date);
 const hourInDay = decimalHourInTZ(p.date, TRIP_TZ);
 return {
 date: p.date,
 h: p.h,
 type: i % 2 === 0 ? (firstIsHigh ? 'high' : 'low') : (firstIsHigh ? 'low' : 'high'),
 dayIdx,
 hourInDay,
 absHour: dayIdx * 24 + hourInDay,
 };
 })
 .sort((a, b) => a.absHour - b.absHour);

 if (!cancelled) setState({ status: 'ready', anchors });
 } catch {
 // Government API unreachable/rate-limited — surface a status rather than fabricating data.
 if (!cancelled) setState({ status: 'error', anchors: null });
 }
 }

 load();
 return () => {
 cancelled = true;
 };
 }, []);

 return state;
}

// Cosine interpolation between two real, known extrema — legitimate now that both ends of
// every segment are actual CHS predictions rather than an invented trough estimate.
function tideHeightAt(anchors, absHour) {
 for (let i = 0; i < anchors.length - 1; i++) {
 const a = anchors[i], b = anchors[i + 1];
 if (absHour < a.absHour || absHour > b.absHour) continue;
 const frac = (absHour - a.absHour) / (b.absHour - a.absHour || 1);
 return a.h + (b.h - a.h) * ((1 - Math.cos(Math.PI * frac)) / 2);
 }
 return absHour < anchors[0].absHour ? anchors[0].h : anchors.at(-1).h;
}

// SVG path (viewBox 0 0 1000 100) tracing the tide curve across the day, interpolated between
// real CHS highs/lows (anchors span the whole trip + buffer days, not just this one).
function sparklinePath(anchors, dayIdx, samples = 96) {
 const pts = Array.from({ length: samples + 1 }, (_, i) => {
 const t = (i / samples) * 24;
 return { t, h: tideHeightAt(anchors, dayIdx * 24 + t) };
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
 const { status: tideStatus, anchors: tideAnchors } = useTideData();
 const now = useNow();

 // "Now" scrubber only renders on the trip day matching today's real date in the trip's
 // timezone — no clamping to the nearest day if the real date falls outside the trip range.
 const todayISO = now.toLocaleDateString('en-CA', { timeZone: TRIP_TZ });
 const nowIdx = TRIP_DATA.findIndex((d) => toISODate(d.date) === todayISO);
 const nowHourPct = (decimalHourInTZ(now, TRIP_TZ) / 24) * 100;
 const nowLabel = formatTimeInTZ(now, TRIP_TZ);
 const nowLabelAlign = nowHourPct < 8 ? 'left-0' : nowHourPct > 92 ? 'right-0' : 'left-1/2 -translate-x-1/2';

 // Define peak heat hours (1 PM to 5 PM) and buffer for tide overlap
 const HOT_START = 13;
 const HOT_END = 17;
 const TIDE_BUFFER = 1.5;

 const checkOverlap = (tideVal) => {
 return (tideVal - TIDE_BUFFER < HOT_END && tideVal + TIDE_BUFFER > HOT_START);
 };

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
 {tideStatus === 'loading' && (
 <p className="text-slate-400 mt-2 text-[11px] sm:text-xs italic">Loading CHS tide predictions…</p>
 )}
 {tideStatus === 'error' && (
 <p className="text-red-400 mt-2 text-[11px] sm:text-xs italic">Tide predictions unavailable — CHS IWLS API unreachable</p>
 )}
 </header>

 {/* Global Timeline Axis — sticky so it stays visible while scrolling a long list */}
 <div className="sticky top-0 z-20 bg-[#FDFDFD]/95 backdrop-blur-sm flex justify-between text-[11px] sm:text-[10px] font-semibold sm:font-medium text-slate-500 sm:ml-24 mb-4 sm:mb-6 px-1 py-2 border-b border-slate-100">
 {AXIS_LABELS.map((label, i) => <span key={i}>{label}</span>)}
 </div>

 <div className="space-y-7 sm:space-y-12">
 {TRIP_DATA.map((day, idx) => {
 const liveMax = liveTemps[toISODate(day.date)];
 const hasLive = liveMax !== undefined;
 const displayTemp = hasLive ? Math.round(liveMax) : day.temp;

 return (
 <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-6">

 {/* Date & Temp — compact caption row on mobile so it reads as a label, not a headline; sidebar column on desktop */}
 <div className="w-full sm:w-24 shrink-0 flex items-baseline justify-between sm:flex-col sm:items-start sm:justify-start gap-0 leading-tight">
 <span className="text-xs sm:text-sm font-semibold sm:font-medium text-slate-900 whitespace-nowrap">{day.day}, {day.date}</span>
 <span className="text-[11px] sm:text-xs text-slate-500 sm:text-slate-400 font-medium sm:font-light tracking-wide whitespace-nowrap">
 {displayTemp}°C
 </span>
 </div>

 {/* Timeline Bar */}
 <div className="flex-1">
 <div className="relative h-1 sm:h-[1px] bg-slate-200 rounded-full mt-6 sm:mt-0 mx-1 sm:mx-0">

 {/* Daylight Band — sunrise to sunset (suncalc, astronomical). Taller than the heat band so its
 edge borders still mark the exact transition times where the two bands overlap in the afternoon. */}
 <div
 className="absolute h-11 sm:h-9 bg-yellow-50/70 top-1/2 -translate-y-1/2 border-x-2 border-yellow-300/60"
 style={{
 left: `${(DAYLIGHT[idx].sunrise / 24) * 100}%`,
 width: `${((DAYLIGHT[idx].sunset - DAYLIGHT[idx].sunrise) / 24) * 100}%`,
 borderRadius: '4px'
 }}
 />

 {/* Tide Sparkline — cosine-interpolated between real CHS predicted highs/lows */}
 {tideAnchors && (
 <svg
 className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-9 sm:h-7 w-full overflow-visible"
 viewBox="0 0 1000 100"
 preserveAspectRatio="none"
 aria-hidden="true"
 >
 <path
 d={sparklinePath(tideAnchors, idx)}
 fill="none"
 stroke={TIDE_CURVE_COLOR}
 stroke-width="7.5"
 vector-effect="non-scaling-stroke"
 />
 </svg>
 )}

 {/* Heat Band Halo — soft extension covering the tide-overlap buffer zone, so a tide dot
 flagged red for sitting within TIDE_BUFFER of peak heat still visually lands inside
 *something* highlighted, rather than floating outside the strict band with no cue. */}
 <div
 className="absolute h-9 sm:h-7 bg-orange-100/40 top-1/2 -translate-y-1/2"
 style={{
 left: `${((HOT_START - TIDE_BUFFER) / 24) * 100}%`,
 width: `${((HOT_END - HOT_START + 2 * TIDE_BUFFER) / 24) * 100}%`,
 borderRadius: '4px'
 }}
 />

 {/* Heat Band */}
 <div
 className="absolute h-9 sm:h-7 bg-orange-200/80 top-1/2 -translate-y-1/2 transition-all duration-300 border-x-2 border-orange-400/70"
 style={{
 left: `${(HOT_START / 24) * 100}%`,
 width: `${((HOT_END - HOT_START) / 24) * 100}%`,
 borderRadius: '4px'
 }}
 />

 {/* Tide Markers — real CHS highs (filled dot, label above) and lows (ring dot, label below) */}
 {tideAnchors && tideAnchors
 .filter((a) => a.dayIdx === idx)
 .map((tide, i) => {
 const isHigh = tide.type === 'high';
 // Overlap-with-heat only matters for highs — a low tide during hot hours is the
 // favorable case (exposed sand), not the hazard this flag exists to surface.
 const isOverlapping = isHigh && checkOverlap(tide.hourInDay);
 const leftPct = (tide.hourInDay / 24) * 100;
 // Near either edge, centering the label on the dot pushes it off-screen — anchor to the dot's edge instead.
 const labelAlign = leftPct < 8 ? 'left-0' : leftPct > 92 ? 'right-0' : 'left-1/2 -translate-x-1/2';

 return (
 <div
 key={i}
 className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center"
 style={{ left: `${leftPct}%`, zIndex: isHigh ? 10 : 9 }}
 >
 {isHigh ? (
 <>
 {/* Text Label */}
 <span className={`absolute bottom-6 sm:bottom-5 ${labelAlign} text-xs sm:text-[10px] tracking-wide font-semibold sm:font-medium whitespace-nowrap transition-colors
 ${isOverlapping ? 'text-red-600 sm:text-red-500' : 'text-blue-600 sm:text-blue-500'}`}>
 {formatTimeInTZ(tide.date, TRIP_TZ)}
 </span>

 {/* Status Dot */}
 <div className={`w-3.5 h-3.5 sm:w-2.5 sm:h-2.5 rounded-full ring-4 transition-all
 ${isOverlapping
 ? 'bg-red-500 ring-red-100'
 : 'bg-blue-500 ring-blue-100'}`}
 />
 </>
 ) : (
 <>
 {/* Low Tide Dot — hollow ring, visually subordinate to the high-tide markers */}
 <div className="w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full bg-white border-2 border-teal-500" />

 {/* Text Label — below the dot so it doesn't collide with the high-tide labels above */}
 <span className={`absolute top-4 sm:top-3.5 ${labelAlign} text-[11px] sm:text-[9px] tracking-wide font-medium text-teal-600 whitespace-nowrap`}>
 {formatTimeInTZ(tide.date, TRIP_TZ)}
 </span>
 </>
 )}
 </div>
 );
 })}

 {/* "Now" Scrubber — live marker on today's row only, spanning the full row height so it
 visibly cuts across the daylight band, heat band, sparkline and tide dots beneath it. */}
 {idx === nowIdx && (
 <div
 className="absolute top-1/2 -translate-y-1/2 z-30 flex flex-col items-center"
 style={{ left: `${nowHourPct}%` }}
 >
 <span className={`absolute -top-7 sm:-top-6 ${nowLabelAlign} text-xs sm:text-[10px] font-bold text-slate-900 whitespace-nowrap tracking-wide`}>
 now · {nowLabel}
 </span>
 <div className="w-0.5 sm:w-0.5 h-20 sm:h-16 bg-slate-900 rounded-full" />
 </div>
 )}
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
 <div className="w-2.5 h-2.5 rounded-full bg-blue-500"></div> High Tide
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2.5 h-2.5 rounded-full bg-red-500"></div> Heat Overlap
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2.5 h-2.5 rounded-full bg-white border-2 border-teal-500"></div> Low Tide
 </div>
 <div className="flex items-center gap-2">
 <div className="w-4 h-4 rounded-sm bg-orange-200/80 border-2 border-orange-400/70"></div> Peak Heat (1PM - 5PM)
 </div>
 <div className="flex items-center gap-2">
 <div className="w-4 h-4 rounded-sm bg-yellow-50/70 border-2 border-yellow-300/60"></div> Daylight (Sunrise–Sunset)
 </div>
 </div>
 <p className="mt-3 text-center text-[11px] sm:text-[10px] text-slate-400 italic">
 Tide predictions: Canadian Hydrographic Service (Denman Island station) — heights interpolated between official highs/lows.
 </p>

 </div>
 </div>
 );
}
