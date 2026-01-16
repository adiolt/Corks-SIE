import React, { useEffect, useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, ZAxis, CartesianGrid, Cell } from 'recharts';
import { WPEvent, EventLabelsRow } from '../types';
import { db } from '../services/storage';
import { eventLabelsService } from '../services/eventLabelsService';
import { TrendingUp, Lightbulb, Calendar, Tag, DollarSign, Loader2, Wine, RefreshCw } from 'lucide-react';
import { DEFAULT_CAPACITY } from '../constants';

const Analytics = () => {
  const [events, setEvents] = useState<WPEvent[]>([]);
  const [labels, setLabels] = useState<Record<number, EventLabelsRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    setLoading(true);
    // 1. Get Events and hydration
    const allEvents = db.getEvents();
    const hydrated = allEvents.map(e => {
        const wpCount = db.getWPAttendees(e.wp_event_id).reduce((s, a) => s + a.quantity, 0);
        const manualCount = db.getManualAttendees(e.wp_event_id).reduce((s, a) => s + a.quantity, 0);
        const total = wpCount + manualCount;
        
        // FIX: Use DEFAULT_CAPACITY if e.capacity is null/0 to prevent 0% occupancy bugs
        const cap = e.capacity || DEFAULT_CAPACITY;
        const occupancy = cap > 0 ? (total / cap) * 100 : 0;

        return { 
            ...e, 
            total, 
            occupancy 
        };
    })
    .filter(e => {
      // Only exclude events with no price AND no attendees (genuinely free events like "Lunea Fericita")
      const hasPrice = (e.price ?? 0) > 0;
      const hasAttendees = (e.total || 0) > 0;
      return hasPrice || hasAttendees;
    });

    // 2. Fetch ALL Labels from Supabase
    const ids = hydrated.map(e => e.wp_event_id);
    const labelRows = await eventLabelsService.getBatch(ids);
    const labelMap: Record<number, EventLabelsRow> = {};
    labelRows.forEach(r => labelMap[r.event_id] = r);

    setEvents(hydrated);
    setLabels(labelMap);
    setLoading(false);
  };

  // --- DATA TRANSFORMATION HELPERS ---

  const calculateAverage = (data: WPEvent[], groupingFn: (e: WPEvent) => string) => {
      const groups: Record<string, { sum: number; count: number }> = {};
      
      data.forEach(e => {
          const key = groupingFn(e) || 'Unlabeled';
          const total = (e as any).total || 0;
          if (!groups[key]) groups[key] = { sum: 0, count: 0 };
          groups[key].sum += total;
          groups[key].count += 1;
      });

      return Object.entries(groups)
        .map(([name, stats]) => ({
            name,
            value: Math.round(stats.sum / stats.count),
            count: stats.count
        }))
        .filter(i => i.count > 0)
        .sort((a, b) => b.value - a.value);
  };

  // --- CHARTS DATA PREPARATION ---

  // 1. By Drinks Label (AI) - REPLACES OLD ENUM CHART
  const statsByDrinks = useMemo(() => calculateAverage(events, e => labels[e.wp_event_id]?.drinks_label || 'Unlabeled'), [events, labels]);

  // 2. By AI Theme Label
  const statsByTheme = useMemo(() => calculateAverage(events, e => labels[e.wp_event_id]?.theme_label || 'Unlabeled'), [events, labels]);

  // 3. By Day of Week
  const statsByDay = useMemo(() => {
      const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
      return calculateAverage(events, e => {
          try {
              return days[new Date(e.start_datetime).getDay()];
          } catch { return 'Err'; }
      }).sort((a, b) => days.indexOf(a.name) - days.indexOf(b.name));
  }, [events]);

  // 4. Scatter: Price vs Occupancy
  const scatterData = useMemo(() => {
      return events
        .filter(e => e.price && (e as any).total > 0)
        .map(e => ({
            x: e.price, // Price
            y: Math.min(Math.round((e as any).occupancy), 120), // Occupancy (cap visual at 120%)
            name: e.title,
            total: (e as any).total, // Z-axis (bubble size)
            label: labels[e.wp_event_id]?.drinks_label || 'Unknown'
        }));
  }, [events, labels]);

  // --- INSIGHTS GENERATION ---
  const getRecommendations = () => {
      const recs: string[] = [];
      
      if (statsByDrinks.length > 0) {
          const top = statsByDrinks[0];
          recs.push(`Evenimentele cu "${top.name}" atrag cei mai mulți oameni (${top.value} medie).`);
      }

      if (statsByTheme.length > 0) {
          const topTheme = statsByTheme[0];
          recs.push(`Tema "${topTheme.name}" performează excelent (medie ${topTheme.value}).`);
      }

      if (statsByDay.length > 0) {
          const sortedDays = [...statsByDay].sort((a,b) => b.value - a.value);
          recs.push(`Ziua de ${sortedDays[0].name} este cea mai populară.`);
      }

      const highOcc = events.filter(e => (e as any).occupancy > 100).length;
      if (highOcc > 0) {
         recs.push(`${highOcc} evenimente au fost overbooked. Ia în calcul creșterea prețului pentru acestea.`);
      }

      return recs;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-lg rounded-lg text-xs">
          <p className="font-bold text-gray-800 mb-1 max-w-[200px] truncate">{data.name}</p>
          <p className="text-gray-600">Preț: <span className="font-mono font-bold text-emerald-600">{data.x} RON</span></p>
          <p className="text-gray-600">Ocupare: <span className={`font-mono font-bold ${data.y >= 100 ? 'text-purple-600' : 'text-blue-600'}`}>{data.y}%</span></p>
          <p className="text-gray-500 mt-1 italic">{data.label}</p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
      return (
          <div className="flex flex-col items-center justify-center h-96 text-gray-400 gap-4">
              <Loader2 size={40} className="animate-spin text-rose-600"/>
              <p>Se calculează datele...</p>
          </div>
      );
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Analiză & Statistici</h1>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
               Bazat pe {events.length} evenimente
            </div>
            <button
              onClick={loadAnalyticsData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Actualizează
            </button>
          </div>
      </div>

      {/* 1. Drinks Performance (Replaces Enum Type) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-start mb-6">
                 <div>
                    <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2"><Wine size={20} className="text-purple-700"/> Medie Participanți / Tip Băutură</h3>
                    <p className="text-xs text-gray-500 mt-1">Clasificare AI (ex: Vin Roșu, Spumant...)</p>
                 </div>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsByDrinks} layout="vertical" margin={{top: 5, right: 30, left: 40, bottom: 5}}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0"/>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={110} tick={{fontSize: 11, fill: '#4b5563'}} interval={0} />
                        <Tooltip cursor={{fill: '#fef2f2'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Bar dataKey="value" fill="#7e22ce" radius={[0, 4, 4, 0]} barSize={24} name="Medie Pers." />
                    </BarChart>
                </ResponsiveContainer>
              </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <div className="flex justify-between items-start mb-6">
                 <div>
                    <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2"><Lightbulb size={20} className="text-indigo-600"/> Medie Participanți / Temă AI</h3>
                    <p className="text-xs text-gray-500 mt-1">Analiză bazată pe conținut (Labels)</p>
                 </div>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statsByTheme} layout="vertical" margin={{top: 5, right: 30, left: 40, bottom: 5}}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f0f0f0"/>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={110} tick={{fontSize: 11, fill: '#4b5563'}} interval={0} />
                        <Tooltip cursor={{fill: '#eff6ff'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                        <Bar dataKey="value" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={24} name="Medie Pers." />
                    </BarChart>
                </ResponsiveContainer>
              </div>
          </div>
      </div>

      {/* 2. Secondary Insights: Time & Money */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2"><Calendar size={18} className="text-teal-600"/> Performanță pe Zile</h3>
              <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statsByDay} margin={{top: 10, right: 10, left: -20, bottom: 0}}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                          <XAxis dataKey="name" tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                          <YAxis tick={{fontSize: 11}} axisLine={false} tickLine={false} />
                          <Tooltip cursor={{fill: '#f0fdf4'}} contentStyle={{borderRadius: '8px'}}/>
                          <Bar dataKey="value" fill="#0d9488" radius={[4, 4, 0, 0]} barSize={40} name="Medie Pers." />
                      </BarChart>
                  </ResponsiveContainer>
              </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2"><DollarSign size={18} className="text-emerald-600"/> Preț vs. Ocupare</h3>
              <p className="text-xs text-gray-500 mb-4">Corelația între prețul biletului și gradul de ocupare (Capacitate: {DEFAULT_CAPACITY} dacă nespecificat).</p>
              <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart margin={{top: 10, right: 10, left: -10, bottom: 0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis type="number" dataKey="x" name="Preț" unit=" RON" tick={{fontSize: 11}} domain={['auto', 'auto']} />
                          <YAxis type="number" dataKey="y" name="Ocupare" unit="%" tick={{fontSize: 11}} domain={[0, 110]} />
                          <ZAxis type="number" dataKey="total" range={[40, 400]} name="Participanți" />
                          <Tooltip content={<CustomTooltip />} cursor={{strokeDasharray: '3 3'}} />
                          <Scatter name="Events" data={scatterData} fill="#059669" fillOpacity={0.6} />
                      </ScatterChart>
                  </ResponsiveContainer>
              </div>
          </div>
      </div>

       {/* Recommendations Panel */}
       <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 rounded-xl shadow-lg text-white">
          <h3 className="font-bold text-xl mb-4 flex items-center gap-2"><TrendingUp size={24} className="text-yellow-400"/> Concluzii & Recomandări</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {getRecommendations().map((rec, idx) => (
                  <div key={idx} className="bg-white/10 backdrop-blur-sm p-4 rounded-lg border border-white/10 flex gap-3 items-start">
                      <span className="text-yellow-400 font-bold text-lg">•</span>
                      <p className="text-sm font-medium leading-relaxed">{rec}</p>
                  </div>
              ))}
          </div>
       </div>

    </div>
  );
};

export default Analytics;