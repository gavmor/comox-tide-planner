import { heatExposureScore, heatExposureAreaPath } from './tideMath';

// "Area under the curve" view for a single day's row: shades the tide curve's actual area
// within the peak-heat window and labels it with the resulting meter-degree-hour score.
// Severity (fill intensity) is scaled relative to the trip's max score so the worst days
// visually pop against the mild ones — the point of the metric is to let days be ranked.
export default function HeatExposureBand({ anchors, dayIdx, tempC, hotStart, hotEnd, maxDegreeHours }) {
 const { degreeHours } = heatExposureScore(anchors, dayIdx, tempC, hotStart, hotEnd);
 const severity = maxDegreeHours > 0 ? Math.min(degreeHours / maxDegreeHours, 1) : 0;
 const areaPath = heatExposureAreaPath(anchors, dayIdx, hotStart, hotEnd);
 const leftPct = (hotStart / 24) * 100;
 const widthPct = ((hotEnd - hotStart) / 24) * 100;

 return (
 <>
 <svg
 className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-9 sm:h-7 w-full overflow-visible"
 viewBox="0 0 1000 100"
 preserveAspectRatio="none"
 aria-hidden="true"
 >
 <path d={areaPath} fill={`rgba(234, 88, 12, ${0.28 + severity * 0.5})`} stroke="none" />
 </svg>
 <span
 className="absolute -top-6 sm:-top-5 text-xs sm:text-[10px] font-bold whitespace-nowrap tracking-wide text-orange-700"
 style={{ left: `${leftPct + widthPct / 2}%`, transform: 'translateX(-50%)' }}
 >
 {degreeHours.toFixed(1)} m·°C·h
 </span>
 </>
 );
}
