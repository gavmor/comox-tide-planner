// Cosine interpolation between two real, known extrema — legitimate now that both ends of
// every segment are actual CHS predictions rather than an invented trough estimate.
export function tideHeightAt(anchors, absHour) {
 for (let i = 0; i < anchors.length - 1; i++) {
 const a = anchors[i], b = anchors[i + 1];
 if (absHour < a.absHour || absHour > b.absHour) continue;
 const frac = (absHour - a.absHour) / (b.absHour - a.absHour || 1);
 return a.h + (b.h - a.h) * ((1 - Math.cos(Math.PI * frac)) / 2);
 }
 return absHour < anchors[0].absHour ? anchors[0].h : anchors.at(-1).h;
}

export const CURVE_PAD = 10; // percent padding top/bottom so curves don't touch the row edges

// The curve is cosine-interpolated strictly between consecutive anchors, so it never overshoots
// them — every extremum of the full trip's curve lands exactly on an anchor. That means the
// global min/max needed for a shared, comparable-across-days vertical scale can be read directly
// off the anchors themselves, no resampling required.
export function globalTideRange(anchors) {
 const heights = anchors.map((a) => a.h);
 const minH = Math.min(...heights);
 const range = Math.max(...heights) - minH || 1;
 return { minH, range };
}

// Samples the tide-height curve across a single day (0–24h) plus the day's own min/range —
// the day's own min still matters even under a shared global scale: it's the real "floor" this
// day's curve touches, used e.g. as the baseline for the heat-exposure fill below.
export function dayCurve(anchors, dayIdx, samples = 96) {
 const pts = Array.from({ length: samples + 1 }, (_, i) => {
 const t = (i / samples) * 24;
 return { t, h: tideHeightAt(anchors, dayIdx * 24 + t) };
 });
 const heights = pts.map((p) => p.h);
 const minH = Math.min(...heights);
 const range = Math.max(...heights) - minH || 1;
 return { pts, minH, range };
}

// minH/range here are the GLOBAL trip-wide values (from globalTideRange), not a single day's —
// that's what makes every row's curve visually comparable to every other row's.
export function scaleFns(minH, range) {
 const toX = (t) => ((t / 24) * 1000).toFixed(1);
 const toY = (h) => (100 - CURVE_PAD - ((h - minH) / range) * (100 - 2 * CURVE_PAD)).toFixed(1);
 return { toX, toY };
}

// "Nice" rounded meter tick values spanning [minH, maxH], e.g. [0, 1, 2, 3] — mirrors the
// treatment of the horizontal AXIS_LABELS (a handful of legible, evenly meaningful marks) rather
// than labeling every sample.
export function tideAxisTicks(minH, maxH, maxTicks = 5) {
 const span = maxH - minH || 1;
 const magnitude = Math.pow(10, Math.floor(Math.log10(span / maxTicks)));
 const candidateSteps = [1, 2, 5, 10].map((m) => m * magnitude);
 // Pick the smallest step (finest ticks) whose resulting count still fits maxTicks — checking
 // the real resulting count directly, rather than approximating from span/step, avoids an
 // off-by-one that picked a coarser step than necessary whenever minH didn't land on a round number.
 const step = candidateSteps.find((c) => {
 const first = Math.ceil(minH / c) * c;
 return Math.floor((maxH - first) / c) + 1 <= maxTicks;
 }) ?? candidateSteps.at(-1);
 const ticks = [];
 for (let v = Math.ceil(minH / step) * step; v <= maxH + 1e-9; v += step) {
 ticks.push(Math.round(v * 10) / 10);
 }
 return ticks;
}

// SVG path (viewBox 0 0 1000 100) tracing the tide curve across the day, interpolated between
// real CHS highs/lows (anchors span the whole trip + buffer days, not just this one). Scaled
// against the trip-wide globalRange so a 1m-swing day and a 4m-swing day are visually comparable.
export function sparklinePath(anchors, dayIdx, globalRange, samples = 96) {
 const { pts } = dayCurve(anchors, dayIdx, samples);
 const { toX, toY } = scaleFns(globalRange.minH, globalRange.range);
 return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.t)} ${toY(p.h)}`).join(' ');
}

// Trapezoidal-rule numeric integration of the tide-height curve over [startHour, endHour]
// within a given day, in meter-hours — the literal "area under the curve" building block for
// the heat-exposure score below.
export function integrateTideHeight(anchors, dayIdx, startHour, endHour, samples = 200) {
 const span = endHour - startHour;
 let total = 0;
 let prev = tideHeightAt(anchors, dayIdx * 24 + startHour);
 for (let i = 1; i <= samples; i++) {
 const h = tideHeightAt(anchors, dayIdx * 24 + startHour + (span * i) / samples);
 total += ((prev + h) / 2) * (span / samples);
 prev = h;
 }
 return total;
}

// meter-degree-hours = daily max temp (°C) × area under the tide-height curve (meter-hours)
// across the peak-heat window. Deliberately uses the strict HOT_START–HOT_END window rather
// than the buffered one: the buffer exists only to soften the boolean tide/heat overlap flag
// visually (see checkOverlap in App.jsx), not to redefine what "peak heat" means for this
// metric. This score is a continuous generalization of that same boolean flag — instead of
// yes/no "does a high tide land near peak heat," it scores every day by how much tide sits
// under the sun during the hottest hours, so days can be ranked by combined heat+tide exposure
// severity instead of just flagged.
export function heatExposureScore(anchors, dayIdx, tempC, hotStart, hotEnd) {
 const areaMH = integrateTideHeight(anchors, dayIdx, hotStart, hotEnd);
 return { areaMH, degreeHours: areaMH * tempC };
}

// Filled polygon tracing the tide curve between hotStart/hotEnd and down to the day's own
// baseline (its lowest sampled tide height across the full day) — same y-scale as the
// sparkline (the trip-wide globalRange), so the shaded region visually lines up with the curve
// it's shading, and stays comparable to every other day's shaded area too.
export function heatExposureAreaPath(anchors, dayIdx, hotStart, hotEnd, globalRange, samples = 48) {
 const { minH: dayMinH } = dayCurve(anchors, dayIdx, 96);
 const { toX, toY } = scaleFns(globalRange.minH, globalRange.range);
 const windowPts = Array.from({ length: samples + 1 }, (_, i) => {
 const t = hotStart + ((hotEnd - hotStart) * i) / samples;
 return { t, h: tideHeightAt(anchors, dayIdx * 24 + t) };
 });
 const baselineY = toY(dayMinH);
 const top = windowPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.t)} ${toY(p.h)}`).join(' ');
 return `${top} L ${toX(hotEnd)} ${baselineY} L ${toX(hotStart)} ${baselineY} Z`;
}
