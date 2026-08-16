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

export default function App() {
 // Define peak heat hours (1 PM to 5 PM) and buffer for tide overlap
 const HOT_START = 13;
 const HOT_END = 17;
 const TIDE_BUFFER = 1.5;

 const checkOverlap = (tideVal) => {
 return (tideVal - TIDE_BUFFER < HOT_END && tideVal + TIDE_BUFFER > HOT_START);
 };

 return (
 <div className="min-h-screen bg-[#FDFDFD] text-slate-800 p-6 sm:p-12 font-sans flex justify-center">
 <div className="w-full max-w-3xl">

 {/* Minimal Header */}
 <header className="mb-16 border-b border-slate-100 pb-8">
 <h1 className="text-3xl sm:text-4xl font-light tracking-tight text-slate-900">Comox Planner</h1>
 <p className="text-slate-400 mt-2 text-sm tracking-wide uppercase">August 14–23 • Tides & Peak Heat</p>
 </header>

 {/* Global Timeline Axis (Abstract) */}
 <div className="flex justify-between text-[10px] font-medium text-slate-300 ml-28 mb-6 px-2">
 <span>12 AM</span>
 <span>12 PM</span>
 <span>12 AM</span>
 </div>

 <div className="space-y-12">
 {TRIP_DATA.map((day, idx) => {
 return (
 <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-6 group hover:opacity-100 transition-opacity">

 {/* Minimal Date & Temp Sidebar */}
 <div className="w-28 shrink-0 flex sm:flex-col items-baseline sm:items-start gap-3 sm:gap-0">
 <span className="text-sm font-medium text-slate-800">{day.day}, {day.date}</span>
 <span className="text-xs text-slate-400 font-light tracking-wide">
 {day.temp}°C {day.note && <span className="ml-1 text-[10px] italic">({day.note})</span>}
 </span>
 </div>

 {/* Abstract Timeline Bar */}
 <div className="flex-1 relative h-[1px] bg-slate-200 mt-6 sm:mt-0 mx-2 sm:mx-0">

 {/* Heat Band (Subtle) */}
 <div
 className="absolute h-[24px] bg-orange-50 top-1/2 -translate-y-1/2 transition-all duration-300 border-x border-orange-100/50"
 style={{
 left: `${(HOT_START / 24) * 100}%`,
 width: `${((HOT_END - HOT_START) / 24) * 100}%`,
 borderRadius: '2px'
 }}
 />

 {/* Tide Markers */}
 {day.tides.map((tide, i) => {
 const isOverlapping = checkOverlap(tide.val);
 const leftPct = (tide.val / 24) * 100;

 return (
 <div
 key={i}
 className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center z-10"
 style={{ left: `${leftPct}%` }}
 >
 {/* Minimal Text Label */}
 <span className={`absolute bottom-4 text-[10px] tracking-wider font-medium whitespace-nowrap transition-colors
 ${isOverlapping ? 'text-red-400' : 'text-blue-400'}`}>
 {tide.time}
 </span>

 {/* Status Dot */}
 <div className={`w-2.5 h-2.5 rounded-full ring-4 transition-all
 ${isOverlapping
 ? 'bg-red-400 ring-red-50'
 : 'bg-blue-400 ring-blue-50'}`}
 />
 </div>
 );
 })}
 </div>
 </div>
 );
 })}
 </div>

 {/* Minimal Legend/Footer */}
 <div className="mt-24 pt-8 border-t border-slate-50 flex flex-wrap items-center justify-center gap-8 text-xs text-slate-400 font-light">
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-blue-400"></div> Clear High Tide
 </div>
 <div className="flex items-center gap-2">
 <div className="w-2 h-2 rounded-full bg-red-400"></div> Heat Overlap
 </div>
 <div className="flex items-center gap-2">
 <div className="w-4 h-4 rounded-sm bg-orange-50 border border-orange-100/50"></div> Peak Heat (1PM - 5PM)
 </div>
 </div>

 </div>
 </div>
 );
}
