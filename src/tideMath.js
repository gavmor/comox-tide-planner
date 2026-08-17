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

// Samples the tide-height curve across a single day (0–24h) plus the day's own min/range —
// shared by the sparkline and the heat-exposure shading below so both draw against the same
// vertical scale and visually line up with each other.
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

function scaleFns(minH, range) {
 const toX = (t) => ((t / 24) * 1000).toFixed(1);
 const toY = (h) => (100 - CURVE_PAD - ((h - minH) / range) * (100 - 2 * CURVE_PAD)).toFixed(1);
 return { toX, toY };
}

// SVG path (viewBox 0 0 1000 100) tracing the tide curve across the day, interpolated between
// real CHS highs/lows (anchors span the whole trip + buffer days, not just this one).
export function sparklinePath(anchors, dayIdx, samples = 96) {
 const { pts, minH, range } = dayCurve(anchors, dayIdx, samples);
 const { toX, toY } = scaleFns(minH, range);
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
// sparkline, so the shaded region visually lines up with the curve it's shading.
export function heatExposureAreaPath(anchors, dayIdx, hotStart, hotEnd, samples = 48) {
 const { minH, range } = dayCurve(anchors, dayIdx, 96);
 const { toX, toY } = scaleFns(minH, range);
 const windowPts = Array.from({ length: samples + 1 }, (_, i) => {
 const t = hotStart + ((hotEnd - hotStart) * i) / samples;
 return { t, h: tideHeightAt(anchors, dayIdx * 24 + t) };
 });
 const baselineY = toY(minH);
 const top = windowPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${toX(p.t)} ${toY(p.h)}`).join(' ');
 return `${top} L ${toX(hotEnd)} ${baselineY} L ${toX(hotStart)} ${baselineY} Z`;
}
