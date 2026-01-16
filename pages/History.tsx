import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, startOfYear } from 'date-fns';
import { ro } from 'date-fns/locale/ro';
import { RefreshCw, Search, AlertCircle, CheckCircle2, Clock, Calendar as CalendarIcon, List as ListIcon, ChevronLeft, ChevronRight, Tag, Wine, Sparkles, History as HistoryIcon } from 'lucide-react';
import { WPEvent, ManualStatus, ManualAttendee, EventLabelsRow, WPTicketPayment } from '../types';
import { db } from '../services/storage';
import { manualAttendeesService } from '../services/manualAttendeesService';
import { eventLabelsService } from '../services/eventLabelsService';
import { paymentsService } from '../services/paymentsService';
import { syncEvents } from '../services/wp';
import { DEFAULT_CAPACITY } from '../constants';

// --- Helper: Decode HTML Entities ---
const decodeHtml = (html: string) => {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
};

const History = () => {
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
  
  // Cache payments globally
  const [allPayments, setAllPayments] = useState<WPTicketPayment[]>([]);

  // Calendar State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date()); // For Mobile Selection
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');

  // Calculate revenue for an event
  const calculateRevenue = (event: WPEvent): number => {
    let onlineRevenue = 0;
    let manualRevenue = 0;
    
    // Online revenue from payments - ensure both sides are strings for comparison
    const eventIdString = String(event.wp_event_id);
    const eventPayments = allPayments.filter(p => String(p.wp_event_id) === eventIdString);
    
    if (eventPayments.length > 0) {
      onlineRevenue = eventPayments.reduce((sum, p) => sum + p.line_total_paid, 0);
    } else {
      // Fallback: use list price
      const wpCount = event.wp_attendees_count || 0;
      onlineRevenue = wpCount * (event.price || 0);
    }
    
    // Manual revenue
    const eventManualAttendees = allManualAttendees.filter(ma => ma.wp_event_id === event.wp_event_id);
    for (const ma of eventManualAttendees) {
      if (ma.status === ManualStatus.REZERVAT || ma.status === ManualStatus.CONFIRMAT || ma.status === ManualStatus.VENIT) {
        const pricePerTicket = ma.ticketPrice ?? event.price ?? 0;
        const attendeeRevenue = pricePerTicket * ma.quantity;
        manualRevenue += attendeeRevenue;
        console.log(`[History Revenue] ${event.title}: Manual attendee ${ma.name}: ${ma.quantity} × ${pricePerTicket} = ${attendeeRevenue} RON (ticketPrice: ${ma.ticketPrice})`);
      }
    }
    
    const total = onlineRevenue + manualRevenue;
    console.log(`[History Revenue] ${event.title}: Online: ${onlineRevenue.toFixed(2)}, Manual: ${manualRevenue.toFixed(2)}, Total: ${total.toFixed(2)} RON`);
    
    return total;
  };

  // Load data helper
  const loadData = async () => {
    // 1. Get WP Events (from local sync cache)
    const allEvents = db.getEvents();
    
    // Filter for history: events from January 1st of current year up to yesterday (before today)
    const startDate = startOfYear(new Date());
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    
    // First filter by date range
    const historyEventsInRange = allEvents.filter(e => {
      const eventDate = new Date(e.start_datetime);
      return eventDate >= startDate && eventDate < today;
    });
    
    // 2. Fetch Manual Attendees (Async, single query)
    let manualData: ManualAttendee[] = [];
    try {
        manualData = await manualAttendeesService.getAll();
        setAllManualAttendees(manualData);
    } catch (e) {
        console.error("History: failed to fetch manual stats", e);
        manualData = db.getAllManualAttendees();
    }
    
    // 3. Fetch Payments (Async)
    try {
        const payments = await paymentsService.getAll();
        setAllPayments(payments);
    } catch (e) {
        console.error("History: failed to fetch payments", e);
    }

    // 4. Hydrate and filter out genuinely free events (no price AND no attendees)
    const hydrated = historyEventsInRange.map(e => {
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
    })
    .filter(e => {
      // Only exclude events with no price AND no attendees (genuinely free events like "Lunea Fericita")
      const hasPrice = (e.price ?? 0) > 0;
      const hasAttendees = (e.wp_attendees_count || 0) > 0 || (e.manual_attendees_count || 0) > 0;
      return hasPrice || hasAttendees;
    });

    // Sort by date desc (most recent first)
    hydrated.sort((a, b) => new Date(b.start_datetime).getTime() - new Date(a.start_datetime).getTime());
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
              console.log(`[History] ${missingIds.length} events missing labels. Queueing background generation...`);
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

  const handleSync = async (silent = false) => {
    if (!silent) setLoading(true);
    
    // 1. Sync WP Events
    const res = await syncEvents();
    
    // Wait for all storage operations to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (!silent || !res.success) {
        setSyncMsg(res.message || '');
    }
    
    // Force page reload for non-silent syncs to ensure all data is fresh
    if (!silent) {
      window.location.reload();
    } else {
      setLoading(false);
      loadData();
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

  // NEW: Manual Refresh for All Tags
  const handleRefreshAllTags = async () => {
      setLabelsRefreshing(true);
      setSyncMsg("Regenerare etichete AI în curs...");
      
      const targetEvents = events;
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
           <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
             <HistoryIcon size={28} />
             Istoric Evenimente
           </h1>
           <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
             <Clock size={12}/> Ultima sincronizare: {lastSyncTime ? format(new Date(lastSyncTime), 'dd/MM HH:mm:ss') : 'Niciodată'}
           </div>
           <div className="text-xs text-gray-600 mt-1">
             Afișare evenimente de la {format(startOfYear(new Date()), 'd MMMM yyyy', { locale: ro })} până ieri
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
                      <div className="md:hidden absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                        {dayEvents.length > 0 && (
                          <div className="w-1 h-1 rounded-full bg-rose-500"></div>
                        )}
                      </div>

                      {/* Desktop Event List */}
                      <div className="hidden md:block space-y-0.5">
                        {dayEvents.slice(0, 3).map((e, i) => {
                          const status = getEventStatus(e);
                          return (
                            <div 
                              key={e.id} 
                              className={`text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer shadow-sm border ${status.color}`}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                navigate(`/event/${e.id}`);
                              }}
                            >
                              {format(new Date(e.start_datetime), 'HH:mm')} {decodeHtml(e.title)}
                            </div>
                          );
                        })}
                        {dayEvents.length > 3 && (
                          <div className="text-[9px] text-gray-500 pl-1">+{dayEvents.length - 3} mai multe</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile: Selected Date Event Detail */}
            <div className="md:hidden bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="text-sm font-semibold mb-2 capitalize text-gray-700">
                  {format(selectedDate, 'EEEE, d MMMM yyyy', { locale: ro })}
                </div>
                {selectedDateEvents.length === 0 ? (
                    <p className="text-xs text-gray-400">Niciun eveniment în această zi.</p>
                ) : (
                    <div className="space-y-2">
                      {selectedDateEvents.map(e => {
                        const status = getEventStatus(e);
                        const total = (e.wp_attendees_count || 0) + (e.manual_attendees_count || 0);
                        return (
                          <div key={e.id} onClick={() => navigate(`/event/${e.id}`)} className="border border-gray-100 rounded-lg p-2 cursor-pointer hover:bg-gray-50 transition">
                            <div className="flex items-start gap-2">
                              <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${status.dot}`}></div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-900 truncate">{decodeHtml(e.title)}</div>
                                <div className="text-[10px] text-gray-500 mt-0.5">
                                  {format(new Date(e.start_datetime), 'HH:mm')} • {total}/{e.capacity || DEFAULT_CAPACITY}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                )}
            </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr className="text-xs md:text-sm text-gray-500 uppercase tracking-wide">
                  <th className="px-2 md:px-4 py-3 text-left font-semibold">Dată</th>
                  <th className="px-2 md:px-4 py-3 text-left font-semibold">Eveniment</th>
                  <th className="px-2 md:px-4 py-3 text-center font-semibold">
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
                   const revenue = calculateRevenue(e);
                   
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

                                {revenue > 0 && (
                                  <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 mt-1 inline-block">
                                    {revenue.toLocaleString()} RON
                                  </div>
                                )}
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
                    <td colSpan={4} className="text-center py-12 text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <HistoryIcon size={48} className="text-gray-300" />
                        <p className="font-medium">Niciun eveniment în istoric</p>
                        <p className="text-xs text-gray-500">Evenimentele trecute vor apărea aici după ce au avut loc.</p>
                      </div>
                    </td>
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

export default History;
