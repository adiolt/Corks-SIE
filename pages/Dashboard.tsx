import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday } from 'date-fns';
import ro from 'date-fns/locale/ro';
import { RefreshCw, Search, Users, AlertCircle, CheckCircle2, Clock, Calendar as CalendarIcon, List as ListIcon, ChevronLeft, ChevronRight, Tag, Wine, Sparkles } from 'lucide-react';
import { WPEvent, ManualStatus, ManualAttendee, EventLabelsRow } from '../types';
import { db } from '../services/storage';
import { manualAttendeesService } from '../services/manualAttendeesService';
import { eventLabelsService } from '../services/eventLabelsService';
import { syncEvents } from '../services/wp';
import { DEFAULT_CAPACITY } from '../constants';

// --- Helper: Decode HTML Entities ---
const decodeHtml = (html: string) => {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<WPEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [labelsRefreshing, setLabelsRefreshing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  
  // Cache manual attendees globally for dashboard to avoid N queries
  const [allManualAttendees, setAllManualAttendees] = useState<ManualAttendee[]>([]);
  
  // Cache labels globally
  const [allLabels, setAllLabels] = useState<Record<number, EventLabelsRow>>({});

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date()); // For Mobile Selection
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');

  // Load data helper
  const loadData = async () => {
    // 1. Get WP Events (from local sync cache)
    const allEvents = db.getEvents();
    
    // 2. Fetch Manual Attendees (Async, single query)
    let manualData: ManualAttendee[] = [];
    try {
        manualData = await manualAttendeesService.getAll();
        setAllManualAttendees(manualData);
    } catch (e) {
        console.error("Dashboard: failed to fetch manual stats", e);
        manualData = db.getAllManualAttendees();
    }

    // 3. Hydrate
    const hydrated = allEvents.map(e => {
      const wpCount = db.getWPAttendees(e.wp_event_id)
        .filter(a => ['completed', 'paid', 'confirmed'].includes(a.status))
        .reduce((sum, a) => sum + a.quantity, 0);
      
      const manualCount = manualData
        .filter(a => a.wp_event_id === e.wp_event_id)
        .filter(a => [ManualStatus.REZERVAT, ManualStatus.CONFIRMAT, ManualStatus.VENIT].includes(a.status as ManualStatus))
        .reduce((sum, a) => sum + a.quantity, 0);

      return {
        ...e,
        wp_attendees_count: wpCount,
        manual_attendees_count: manualCount
      };
    });

    // Sort by date desc
    hydrated.sort((a, b) => new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime());
    setEvents(hydrated);
    setLastSyncTime(db.getLastSync());
    
    // 4. Fetch/Generate Labels for hydrated events
    loadLabelsForEvents(hydrated);
  };

  const loadLabelsForEvents = async (loadedEvents: WPEvent[]) => {
      // 1. Batch fetch existing from Supabase
      const ids = loadedEvents.map(e => e.wp_event_id);
      if (ids.length === 0) return;
      
      try {
          const fetched = await eventLabelsService.getBatch(ids);
          const labelMap: Record<number, EventLabelsRow> = {};
          fetched.forEach(row => {
              labelMap[row.event_id] = row;
          });
          setAllLabels(prev => ({ ...prev, ...labelMap }));
          
          // 2. Identify missing
          const missingIds = ids.filter(id => !labelMap[id]);
          if (missingIds.length > 0) {
              console.log(`[Dashboard] ${missingIds.length} events missing labels. Queueing background generation...`);
              // Trigger background generation (throttled)
              processMissingLabelsQueue(missingIds, loadedEvents);
          }
      } catch (e) {
          console.error("Failed to batch load labels", e);
      }
  };

  // Simple throttled processor for background label generation
  const processMissingLabelsQueue = async (missingIds: number[], allEvents: WPEvent[]) => {
      // Process 2 at a time
      const CHUNK_SIZE = 2;
      for (let i = 0; i < missingIds.length; i += CHUNK_SIZE) {
          const chunk = missingIds.slice(i, i + CHUNK_SIZE);
          await Promise.all(chunk.map(async (id) => {
              const evt = allEvents.find(e => e.wp_event_id === id);
              if (evt) {
                  try {
                      const res = await eventLabelsService.ensureForEvent({
                          wp_event_id: id,
                          title: decodeHtml(evt.title),
                          description: evt.description,
                          wineList: undefined 
                      });
                      if (res) {
                          setAllLabels(prev => ({ ...prev, [id]: res }));
                      }
                  } catch (err) {
                      console.warn(`Background label gen failed for ${id}`, err);
                  }
              }
          }));
          await new Promise(r => setTimeout(r, 500));
      }
  };

  useEffect(() => {
    loadData();
    // Initial sync
    handleSync(true);
    
    // Auto sync every minute
    const interval = setInterval(() => {
        handleSync(true);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSync = async (silent = false) => {
    if (!silent) setLoading(true);
    
    // 1. Sync WP Events
    const res = await syncEvents();
    
    if (!silent || !res.success) {
        setSyncMsg(res.message || '');
        if (res.success) setTimeout(() => setSyncMsg(''), 5000);
    }
    setLoading(false);
    loadData();
  };

  // NEW: Manual Refresh for All Tags
  const handleRefreshAllTags = async () => {
      setLabelsRefreshing(true);
      setSyncMsg("Regenerare etichete AI în curs...");
      
      // Filter pertinent events (e.g., upcoming + last 30 days) to avoid wasting tokens on ancient history
      const now = new Date();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      
      const targetEvents = events.filter(e => new Date(e.start_datetime) > cutoff);
      const ids = targetEvents.map(e => e.wp_event_id);

      // Process 2 at a time to avoid rate limits
      const CHUNK_SIZE = 2;
      let processed = 0;

      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
          const chunk = ids.slice(i, i + CHUNK_SIZE);
          await Promise.all(chunk.map(async (id) => {
              const evt = targetEvents.find(e => e.wp_event_id === id);
              if (evt) {
                  try {
                      // FORCE = true
                      const res = await eventLabelsService.ensureForEvent({
                          wp_event_id: id,
                          title: decodeHtml(evt.title),
                          description: evt.description,
                          wineList: evt.extracted_wines
                      }, true); 
                      
                      if (res) {
                          setAllLabels(prev => ({ ...prev, [id]: res }));
                      }
                  } catch (err) {
                      console.warn(`Label refresh failed for ${id}`, err);
                  }
              }
          }));
          processed += chunk.length;
          // Small delay between chunks
          await new Promise(r => setTimeout(r, 800));
      }
      
      setLabelsRefreshing(false);
      setSyncMsg("Etichete actualizate cu succes.");
      setTimeout(() => setSyncMsg(''), 3000);
  };

  // Status Logic
  const getEventStatus = (e: WPEvent) => {
    const total = (e.wp_attendees_count || 0) + (e.manual_attendees_count || 0);
    const capacity = e.capacity || DEFAULT_CAPACITY;
    
    if (total > capacity) return { label: 'OVERBOOKED', color: 'bg-white/80 text-purple-900 ring-1 ring-purple-500', dot: 'bg-purple-600' };
    
    const remaining = capacity - total;
    if (remaining <= 0) return { label: 'FULL', color: 'bg-white/80 text-red-900', dot: 'bg-red-500' };
    if (remaining <= 5) return { label: 'Last Spots', color: 'bg-white/80 text-orange-900', dot: 'bg-orange-500' };
    return { label: 'Open', color: 'bg-white/80 text-green-900', dot: 'bg-green-500' };
  };

  // Row Color Logic
  const getRowStyle = (total: number, capacity: number) => {
    if (total > capacity) return 'bg-rose-200 hover:bg-rose-300 border-rose-300';
    if (total >= 20) return 'bg-emerald-50 hover:bg-emerald-100 border-emerald-100';
    if (total >= 10) return 'bg-orange-50 hover:bg-orange-100 border-orange-100';
    return 'bg-red-50 hover:bg-red-100 border-red-100';
  };

  // Calendar Logic
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Filtered List
  const filteredEvents = events.filter(e => 
    e.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedDateEvents = useMemo(() => {
    return events.filter(e => {
        try {
            return isSameDay(new Date(e.start_datetime), selectedDate);
        } catch { return false; }
    });
  }, [events, selectedDate]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-800">Evenimente</h1>
           <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
             <Clock size={12}/> Ultima sincronizare: {lastSyncTime ? format(new Date(lastSyncTime), 'dd/MM HH:mm:ss') : 'Niciodată'}
           </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
           <div className="relative flex-1 md:flex-none">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
             <input 
               type="text" 
               placeholder="Caută..." 
               className="pl-9 pr-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-rose-500 outline-none w-full md:w-48 placeholder-gray-500"
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
             />
           </div>
           
           <div className="bg-gray-200 rounded-lg p-1 flex shrink-0">
             <button 
               className={`px-3 py-1.5 text-sm rounded-md transition flex items-center gap-1 ${viewMode === 'calendar' ? 'bg-white shadow text-rose-700 font-medium' : 'text-gray-600'}`}
               onClick={() => setViewMode('calendar')}
             >
               <CalendarIcon size={14}/>
             </button>
             <button 
               className={`px-3 py-1.5 text-sm rounded-md transition flex items-center gap-1 ${viewMode === 'list' ? 'bg-white shadow text-rose-700 font-medium' : 'text-gray-600'}`}
               onClick={() => setViewMode('list')}
             >
               <ListIcon size={14}/>
             </button>
           </div>
           
           <div className="flex gap-2">
               <button 
                 onClick={handleRefreshAllTags} 
                 disabled={labelsRefreshing || loading}
                 className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shrink-0 shadow-sm"
                 title="Regenerează toate etichetele AI"
               >
                 <Sparkles size={16} className={labelsRefreshing ? 'animate-spin' : ''} />
                 <span className="hidden sm:inline text-xs font-bold">Refresh Tags</span>
               </button>

               <button 
                 onClick={() => handleSync()} 
                 disabled={loading}
                 className="flex items-center gap-2 bg-rose-700 text-white px-3 py-2 rounded-lg hover:bg-rose-800 disabled:opacity-50 transition shrink-0 shadow-sm"
               >
                 <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
               </button>
           </div>
        </div>
      </div>

      {syncMsg && (
        <div className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm border ${syncMsg.includes('succes') || syncMsg.includes('reușită') ? 'bg-green-50 text-green-700 border-green-100' : 'bg-orange-50 text-orange-700 border-orange-100'}`}>
           {syncMsg.includes('succes') || syncMsg.includes('reușită') ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>} {syncMsg}
        </div>
      )}

      {viewMode === 'calendar' ? (
        <div className="flex flex-col gap-4">
            {/* Calendar Grid */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50">
                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-1 hover:bg-gray-200 rounded"><ChevronLeft size={20}/></button>
                <span className="font-semibold text-lg capitalize">{format(currentDate, 'MMMM yyyy', { locale: ro })}</span>
                <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-1 hover:bg-gray-200 rounded"><ChevronRight size={20}/></button>
              </div>
              <div className="grid grid-cols-7 text-center text-[10px] md:text-xs font-semibold text-gray-500 border-b bg-gray-50 py-2">
                <div>LUN</div><div>MAR</div><div>MIE</div><div>JOI</div><div>VIN</div><div>SAM</div><div>DUM</div>
              </div>
              <div className="grid grid-cols-7 bg-gray-200 gap-px">
                {daysInMonth.map((day) => {
                  const dayEvents = events.filter(e => {
                      try { return isSameDay(new Date(e.start_datetime), day); } catch (err) { return false; }
                  });
                  const isCurrentMonth = isSameMonth(day, currentDate);
                  const isDaySelected = isSameDay(day, selectedDate);
                  const isTodayDate = isToday(day);
                  
                  return (
                    <div 
                        key={day.toISOString()} 
                        onClick={() => setSelectedDate(day)}
                        className={`min-h-[50px] md:min-h-[120px] bg-white p-1 md:p-2 cursor-pointer transition-colors relative
                            ${!isCurrentMonth ? 'opacity-40 bg-gray-50' : ''}
                            ${isDaySelected ? 'bg-rose-50 ring-inset ring-2 ring-rose-300 z-10' : 'hover:bg-gray-50'}
                        `}
                    >
                      <div className={`text-center md:text-right text-xs md:text-sm font-medium mb-1 w-6 h-6 md:w-auto md:h-auto mx-auto md:mx-0 flex items-center justify-center rounded-full
                          ${isTodayDate ? 'bg-rose-600 text-white md:bg-transparent md:text-rose-600 md:font-bold' : 'text-gray-700'}
                      `}>
                        {format(day, 'd')}
                      </div>

                      {/* Mobile Dot Indicator */}
                      <div className="md:hidden flex gap-0.5 justify-center mt-1 flex-wrap h-4 content-start">
                        {dayEvents.slice(0, 4).map(e => {
                            const status = getEventStatus(e);
                            return <div key={e.id} className={`w-1.5 h-1.5 rounded-full ${status.dot}`}></div>
                        })}
                        {dayEvents.length > 4 && <div className="w-1.5 h-1.5 rounded-full bg-gray-300"></div>}
                      </div>

                      {/* Desktop Full View */}
                      <div className="hidden md:flex flex-col gap-1 mt-1">
                        {dayEvents.map(e => {
                            const status = getEventStatus(e);
                            const total = (e.wp_attendees_count || 0) + (e.manual_attendees_count || 0);
                            const label = allLabels[e.wp_event_id];
                            
                            return (
                                <div 
                                    key={e.id}
                                    onClick={(ev) => { ev.stopPropagation(); navigate(`/event/${e.id}`); }}
                                    className="bg-gray-50 border border-gray-200 rounded p-1.5 hover:shadow-md hover:border-rose-300 transition group cursor-pointer"
                                >
                                    <div className="text-xs font-bold text-gray-800 truncate">{format(new Date(e.start_datetime), 'HH:mm')} {decodeHtml(e.title)}</div>
                                    {/* Labels Mini */}
                                    <div className="flex gap-1 mt-0.5 mb-0.5">
                                        {label ? (
                                            <>
                                                <span className="text-[8px] bg-purple-50 text-purple-700 px-1 rounded truncate max-w-[45%]">{label.drinks_label}</span>
                                                <span className="text-[8px] bg-indigo-50 text-indigo-700 px-1 rounded truncate max-w-[45%]">{label.theme_label}</span>
                                            </>
                                        ) : (
                                            <span className="text-[8px] bg-gray-100 text-gray-400 px-1 rounded animate-pulse w-12">...</span>
                                        )}
                                    </div>

                                    {e.price ? <div className="text-[10px] font-bold text-rose-600 truncate leading-none mb-0.5">{e.price} RON</div> : null}
                                    <div className="flex justify-between items-center mt-1">
                                        <span className={`text-[9px] px-1 rounded-sm uppercase tracking-wider ${status.color}`}>{status.label}</span>
                                        <div className="flex items-center text-[10px] text-gray-500 gap-0.5 font-mono">
                                            <Users size={10} /> {total}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile Detail View */}
            <div className="md:hidden bg-white rounded-xl shadow-sm border border-gray-200 p-4 animate-in slide-in-from-top-4">
                <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs uppercase">{format(selectedDate, 'EEE', {locale: ro})}</span>
                    {format(selectedDate, 'd MMMM yyyy', {locale: ro})}
                </h3>
                
                {selectedDateEvents.length > 0 ? (
                    <div className="space-y-3">
                        {selectedDateEvents.map(e => {
                            const status = getEventStatus(e);
                            const total = (e.wp_attendees_count || 0) + (e.manual_attendees_count || 0);
                            const label = allLabels[e.wp_event_id];
                            return (
                                <div key={e.id} onClick={() => navigate(`/event/${e.id}`)} className="bg-gray-50 border border-gray-100 p-3 rounded-lg flex justify-between items-center active:bg-gray-100">
                                    <div className="flex-1 min-w-0 pr-3">
                                        <div className="text-sm font-bold text-gray-900 truncate">{decodeHtml(e.title)}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-2 mt-1 mb-1">
                                            <span className="font-mono text-gray-700 bg-white px-1 border rounded">{format(new Date(e.start_datetime), 'HH:mm')}</span>
                                            <span className="capitalize">{e.event_type}</span>
                                        </div>
                                        <div className="flex gap-1 mb-1">
                                            {label ? (
                                                <>
                                                    <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 rounded-full border border-purple-100">{label.drinks_label}</span>
                                                    <span className="text-[9px] bg-indigo-50 text-indigo-700 px-1.5 rounded-full border border-indigo-100">{label.theme_label}</span>
                                                </>
                                            ) : (
                                                <span className="text-[9px] text-gray-400 bg-gray-100 px-2 rounded animate-pulse">...</span>
                                            )}
                                        </div>
                                        {e.price ? <div className="text-xs font-bold text-rose-600 mt-1">{e.price} RON</div> : null}
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                         <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${status.color}`}>{status.label}</span>
                                         <span className="text-xs text-gray-600 font-medium flex items-center gap-1"><Users size={12}/> {total}/{e.capacity || DEFAULT_CAPACITY}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-lg border border-dashed border-gray-200">
                        Niciun eveniment în această zi.
                    </div>
                )}
            </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                <tr>
                  <th className="px-2 py-2 md:px-4 md:py-3 w-16 md:w-auto text-xs md:text-sm">Data</th>
                  <th className="px-2 py-2 md:px-4 md:py-3 text-xs md:text-sm">Eveniment</th>
                  <th className="px-2 py-2 md:px-4 md:py-3 text-center text-xs md:text-sm w-14 md:w-auto">
                    <span className="md:hidden">Locuri</span>
                    <span className="hidden md:inline">Locuri (Ocupat / Total)</span>
                  </th>
                  <th className="hidden sm:table-cell px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100/50">
                {filteredEvents.map(e => {
                   const total = (e.wp_attendees_count || 0) + (e.manual_attendees_count || 0);
                   const status = getEventStatus(e);
                   const rowColor = getRowStyle(total, e.capacity || DEFAULT_CAPACITY);
                   const label = allLabels[e.wp_event_id];
                   
                   return (
                    <tr key={e.id} onClick={() => navigate(`/event/${e.id}`)} className={`${rowColor} cursor-pointer transition border-b border-white/40`}>
                        <td className="px-2 py-2 md:px-4 md:py-3 text-gray-700 font-medium capitalize text-[10px] md:text-sm whitespace-nowrap">
                           <div className="md:hidden flex flex-col leading-tight">
                              <span className="font-bold text-gray-900">{format(new Date(e.start_datetime), 'd MMM', { locale: ro })}</span>
                              <span className="text-gray-500">{format(new Date(e.start_datetime), 'HH:mm')}</span>
                           </div>
                           <span className="hidden md:inline">
                              {format(new Date(e.start_datetime), 'EEEE, d MMM HH:mm', { locale: ro })}
                           </span>
                        </td>
                        <td className="px-2 py-2 md:px-4 md:py-3 font-medium text-gray-900">
                           <div className="flex items-start gap-1.5">
                              {/* Mobile Status Dot */}
                              <div className={`mt-1 min-w-[6px] h-1.5 rounded-full sm:hidden ${status.dot}`}></div>
                              <div>
                                <div className="text-xs md:text-base line-clamp-2 md:line-clamp-1 leading-snug">{decodeHtml(e.title)}</div>
                                <div className="text-[10px] md:text-xs text-gray-500 font-normal mt-0.5 mix-blend-multiply flex gap-2">
                                  <span>{e.event_type}</span>
                                </div>
                                
                                {/* List Labels */}
                                <div className="flex flex-wrap gap-1 mt-1">
                                   {label ? (
                                      <>
                                          <span className="inline-flex items-center gap-1 text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-100">
                                            <Wine size={10}/> {label.drinks_label}
                                          </span>
                                          <span className="inline-flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">
                                            <Tag size={10}/> {label.theme_label}
                                          </span>
                                      </>
                                   ) : (
                                      <span className="text-[10px] text-gray-400 bg-white/50 px-2 rounded animate-pulse">...</span>
                                   )}
                                </div>

                                {e.price ? <div className="text-xs font-bold text-rose-600 mt-0.5">{e.price} RON</div> : null}
                              </div>
                           </div>
                        </td>
                        <td className="px-2 py-2 md:px-4 md:py-3 text-center">
                           <div className="flex flex-col md:flex-row justify-center items-center md:gap-1 leading-tight">
                              <span className="font-bold text-gray-900 text-xs md:text-sm">{total}</span>
                              <span className="text-[10px] md:text-sm text-gray-500 mix-blend-multiply">/ {e.capacity || DEFAULT_CAPACITY}</span>
                           </div>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold shadow-sm ${status.color}`}>
                                {status.label}
                            </span>
                        </td>
                    </tr>
                   );
                })}
                {filteredEvents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-gray-400">Niciun eveniment găsit.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;