import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import ro from 'date-fns/locale/ro';
import { ArrowLeft, Users, Plus, Trash2, X, Phone, Ticket, AlertTriangle, ChevronDown, ChevronUp, Utensils, Wine, ChevronRight, Copy, Loader2, RefreshCw, Save, CheckCircle2, Pencil, Tag, DollarSign, Database, Server } from 'lucide-react';
import { WPEvent, AttendeeRecord, ManualAttendee, ManualSource, ManualStatus, PostEventReview, NoteTagReason, RatingMetrics, EventLabelsRow, WPTicketPayment } from '../types';
import { db } from '../services/storage';
import { manualAttendeesService } from '../services/manualAttendeesService';
import { postEventReviewsService } from '../services/postEventReviewsService';
import { eventLabelsService } from '../services/eventLabelsService';
import { paymentsService } from '../services/paymentsService';
import { extractFoodMenu, extractWineList } from '../services/aiExtraction';
import { DEFAULT_CAPACITY } from '../constants';

// --- Helper: Decode HTML Entities ---
const decodeHtml = (html: string) => {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
};

// --- Helper: Face Rating Component ---
const FACES = [
  { val: 1, icon: '😞', label: 'Rău' },
  { val: 2, icon: '😕', label: 'Sub așteptări' },
  { val: 3, icon: '😐', label: 'OK' },
  { val: 4, icon: '🙂', label: 'Bun' },
  { val: 5, icon: '😄', label: 'Excelent' }
];

interface FaceRatingProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  error?: boolean;
}

const FaceRating: React.FC<FaceRatingProps> = ({ label, value, onChange, error }) => {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-gray-50 last:border-0 ${error ? 'bg-red-50 px-2 -mx-2 rounded' : ''}`}>
      <span className={`text-sm font-medium ${error ? 'text-red-600' : 'text-gray-700'}`}>{label}</span>
      <div className="flex gap-1 mt-1 sm:mt-0" role="radiogroup" aria-label={label}>
        {FACES.map((face) => {
          const isSelected = value === face.val;
          return (
            <button
              key={face.val}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onChange(face.val)}
              title={face.label}
              className={`
                text-2xl w-9 h-9 flex items-center justify-center rounded-full transition-all duration-200
                ${isSelected ? 'scale-110 bg-white shadow-sm ring-2 ring-offset-1 ring-rose-500 opacity-100' : 'opacity-40 hover:opacity-100 hover:scale-110'}
              `}
            >
              <span className="filter drop-shadow-sm">{face.icon}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// --- Modal Component (Smart) ---
interface SmartModalProps {
  type: 'food' | 'wine';
  eventId: string;
  description: string;
  onClose: () => void;
}

const SmartModal: React.FC<SmartModalProps> = ({ type, eventId, description, onClose }) => {
  const [items, setItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const title = type === 'food' ? "Meniu Mâncare" : "Lista Vinuri";
  const Icon = type === 'food' ? Utensils : Wine;

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      const result = type === 'food' 
        ? await extractFoodMenu(eventId, description)
        : await extractWineList(eventId, description);
      setItems(result);
    } catch (err) {
      setError("Nu pot extrage automat. Verifică conexiunea sau încearcă din nou.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [type, eventId]);

  const handleCopy = () => {
    const text = items.join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className={`p-4 flex justify-between items-center text-white ${type === 'food' ? 'bg-orange-600' : 'bg-purple-800'}`}>
          <h3 className="font-bold flex items-center gap-2"><Icon size={20}/> {title}</h3>
          <button onClick={onClose} className="hover:bg-black/20 p-1 rounded transition"><X size={20}/></button>
        </div>
        <div className="p-6 max-h-[60vh] overflow-y-auto min-h-[150px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500 gap-3">
              <Loader2 size={32} className="animate-spin text-rose-600"/>
              <p className="text-sm font-medium animate-pulse">Analizez descrierea cu AI...</p>
            </div>
          ) : error ? (
            <div className="text-center py-4">
               <AlertTriangle size={32} className="mx-auto text-red-500 mb-2"/>
               <p className="text-red-600 text-sm mb-4">{error}</p>
               <button onClick={fetchData} className="flex items-center gap-2 mx-auto bg-gray-100 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
                 <RefreshCw size={14}/> Încearcă din nou
               </button>
            </div>
          ) : items.length > 0 ? (
            <ul className="space-y-3">
              {items.map((item, i) => (
                <li key={i} className="flex gap-3 text-gray-800 leading-snug">
                  <span className={`${type === 'food' ? 'text-orange-600' : 'text-purple-600'} font-bold min-w-[6px]`}>•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-center text-gray-500 italic py-8">Nu am găsit elemente specifice în descriere.</p>
          )}
        </div>
        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
          <button 
             onClick={handleCopy} 
             disabled={loading || items.length === 0}
             className="flex items-center gap-2 text-rose-700 px-3 py-2 rounded-lg text-sm font-bold hover:bg-rose-50 disabled:opacity-50 disabled:grayscale transition"
          >
             {copied ? <CheckCircle2 size={16}/> : <Copy size={16}/>}
             {copied ? "Copiat!" : "Copiază lista"}
          </button>
          <button onClick={onClose} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg font-medium transition text-sm">
            Închide
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Delete Confirmation Modal ---
const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm }: { isOpen: boolean; onClose: () => void; onConfirm: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 transform transition-all scale-100" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
            <Trash2 size={24} />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Ștergi rezervarea?</h3>
          <p className="text-gray-500 text-sm mb-6">
            Ești sigur că vrei să ștergi această rezervare? Acțiunea este ireversibilă.
          </p>
          <div className="flex gap-3 w-full">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition"
            >
              Anulează
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-2.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 shadow-md transition"
            >
              Șterge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EventDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<WPEvent | undefined>(undefined);
  const [wpAttendees, setWpAttendees] = useState<AttendeeRecord[]>([]);
  const [manualAttendees, setManualAttendees] = useState<ManualAttendee[]>([]);
  const [payments, setPayments] = useState<WPTicketPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Sync State
  const [syncingPayments, setSyncingPayments] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);

  // Labels State
  const [labels, setLabels] = useState<EventLabelsRow | null>(null);
  const [labelsLoading, setLabelsLoading] = useState(false);

  // Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [attendeeToDelete, setAttendeeToDelete] = useState<string | null>(null);

  // Description UI State
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [activeModal, setActiveModal] = useState<'food' | 'wine' | null>(null);

  // Form State for Manual Attendee
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<ManualAttendee>>({
    quantity: 1,
    source: ManualSource.TELEFON,
    status: ManualStatus.REZERVAT,
    name: '',
    phone: '',
    email: '',
    notes: ''
  });

  // --- REVIEW STATE ---
  const [review, setReview] = useState<Partial<PostEventReview>>({
    ratings: { wineQuality: 0, foodQuality: 0, speedOfService: 0, atmosphere: 0, profitability: 0 },
    recap: '',
    tags: [],
    notes: ''
  });
  const [savingReview, setSavingReview] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [reviewErrors, setReviewErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (id) {
      loadEventData();
    }
  }, [id]);

  const loadEventData = async () => {
    // 1. Load Event & WP Attendees from LocalStorage (Sync)
    const e = db.getEvent(id!);
    if (e) {
      setEvent(e);
      
      const fetchedAttendees = db.getAttendeesForEvent(e.wp_event_id);
      fetchedAttendees.sort((a, b) => new Date(a.createdUtc).getTime() - new Date(b.createdUtc).getTime());
      setWpAttendees(fetchedAttendees);

      // Trigger Labels Load (Parallel)
      loadLabels(e);
      
      // Load Payments (Initial)
      await loadPayments(e);

      // Auto-sync payments if missing and we have attendees
      if (fetchedAttendees.length > 0 && payments.length === 0) {
         // Optionally trigger auto-sync here if desired, but button is safer for now.
         // handleSyncPayments(e, fetchedAttendees);
      }

      // 2. Load Manual Attendees (Async via Service)
      try {
        const manual = await manualAttendeesService.listByEvent(e.wp_event_id);
        setManualAttendees(manual);
      } catch (err) {
        console.error("Failed to load manual attendees", err);
        setManualAttendees([]);
      }

      // 3. Load Review (Async via Service)
      try {
        const existingReview = await postEventReviewsService.getByEvent(e.wp_event_id);
        if (existingReview) {
            setReview(existingReview);
            setLastSaved(existingReview.updatedAt);
        }
      } catch (err) {
        console.error("Failed to load review", err);
      }
    }
    setLoading(false);
  };

  const loadLabels = async (evt: WPEvent) => {
    setLabelsLoading(true);
    try {
      const data = await eventLabelsService.ensureForEvent({
        wp_event_id: evt.wp_event_id,
        title: decodeHtml(evt.title),
        description: evt.description,
        wineList: evt.extracted_wines // Pass existing extracted wines if any
      });
      setLabels(data);
    } catch (err) {
      console.error("Labels error:", err);
    } finally {
      setLabelsLoading(false);
    }
  };

  const loadPayments = async (evt: WPEvent) => {
      try {
          const data = await paymentsService.getByEventId(evt.wp_event_id);
          setPayments(data);
      } catch (e) {
          console.error("Failed to load payments", e);
      }
  };

  const handleSyncPayments = async () => {
    if (!event) return;
    setSyncingPayments(true);
    setSyncResult(null);

    const orderIds = wpAttendees.map(a => String(a.orderId)).filter(Boolean);
    
    // Call Edge Function
    const res = await paymentsService.syncPaymentsViaEdge(String(event.wp_event_id), orderIds);
    
    setSyncResult(res);
    if (res.success) {
      await loadPayments(event);
    } else {
      setGlobalError(`Sync failed: ${res.error}`);
    }
    setSyncingPayments(false);
  };

  const handleRegenerateLabels = async () => {
    if (!event) return;
    setLabelsLoading(true);
    try {
        const generated = await import('../services/aiLabels').then(m => m.generateEventLabels({
            eventId: event.wp_event_id,
            title: decodeHtml(event.title),
            description: event.description,
            wineList: event.extracted_wines
        }));
        
        const saved = await eventLabelsService.upsertByEvent(event.wp_event_id, {
            drinks_label: generated.drinks_label,
            theme_label: generated.theme_label,
            confidence: generated.confidence,
            reasoning: generated.reasoning,
            source: 'ai_manual_regen'
        });
        setLabels(saved);
    } catch (e) {
        console.error("Regen failed", e);
        setGlobalError("Regenerarea a eșuat. Verifică conexiunea.");
    } finally {
        setLabelsLoading(false);
    }
  };

  const totals = useMemo(() => {
    if (!event) return { wp: 0, manual: 0, total: 0, remaining: 0, percent: 0, overbooked: false, cap: 0, revenue: 0 };
    
    const wp = wpAttendees.length;

    // Filter valid manual attendees
    const manual = manualAttendees
      .filter(a => [ManualStatus.REZERVAT, ManualStatus.CONFIRMAT, ManualStatus.VENIT].includes(a.status))
      .reduce((sum, a) => sum + a.quantity, 0);

    const total = wp + manual;
    const cap = event.capacity || DEFAULT_CAPACITY;
    const remaining = cap - total;
    const percent = Math.round((total / cap) * 100);
    const overbooked = total > cap;

    // Compute Total Revenue
    let revenue = 0;
    
    // 1. Online Revenue (From Payments Table if available, else list price)
    // Use line_total_paid sum for accuracy
    if (payments.length > 0) {
        revenue += payments.reduce((sum, p) => sum + (Number(p.line_total_paid) || 0), 0);
    } else {
        // Fallback: list price * wp attendees count
        revenue += wp * (event.price || 0);
    }

    // 2. Manual Revenue
    revenue += manual * (event.price || 0);

    return { wp, manual, total, remaining, percent, overbooked, cap, revenue };
  }, [event, wpAttendees, manualAttendees, payments]);

  const getPaymentForAttendee = (attendee: AttendeeRecord) => {
      if (!payments.length) return null;
      // Filter payments for this order
      const orderPayments = payments.filter(p => p.wp_order_id === String(attendee.orderId));
      if (orderPayments.length === 0) return null;

      // Heuristic: Try to match by ticket name/event title loosely if multiple items
      // For MVP, just taking the first or the one that seems to match price if simple
      // Ideally, the WP attendee has a 'product_id' we can match to 'wp_ticket_payments.raw.product_id' if we stored it.
      // But we stored minimal data.
      // Let's return the first item that has a positive value, or just the first one.
      return orderPayments[0];
  };

  // ... (Manual Attendee Form Logic omitted for brevity, same as before) ...
  const resetForm = () => {
    setFormData({ quantity: 1, source: ManualSource.TELEFON, status: ManualStatus.REZERVAT, name: '', phone: '', email: '', notes: '' });
    setEditingId(null);
    setShowAddForm(false);
  };

  const startEdit = (attendee: ManualAttendee) => {
    setFormData({
      name: attendee.name,
      quantity: attendee.quantity,
      source: attendee.source,
      status: attendee.status,
      phone: attendee.phone || '',
      email: attendee.email || '',
      notes: attendee.notes || ''
    });
    setEditingId(attendee.id);
    setShowAddForm(true);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !formData.name) return;
    setIsRefreshing(true);
    setGlobalError(null);
    try {
      if (editingId) {
        await manualAttendeesService.update(editingId, {
          name: formData.name,
          quantity: Number(formData.quantity) || 1,
          source: formData.source as ManualSource,
          status: formData.status as ManualStatus,
          phone: formData.phone,
          email: formData.email,
          notes: formData.notes
        });
      } else {
        const currentUser = db.getCurrentUser();
        await manualAttendeesService.add({
          wp_event_id: event.wp_event_id,
          name: formData.name!,
          quantity: Number(formData.quantity) || 1,
          source: formData.source as ManualSource,
          status: formData.status as ManualStatus,
          phone: formData.phone,
          email: formData.email,
          notes: formData.notes,
          created_by_user_id: currentUser?.id || 'unknown'
        });
      }
      resetForm();
      const updatedList = await manualAttendeesService.listByEvent(event.wp_event_id);
      setManualAttendees(updatedList);
    } catch (err) {
      console.error("Error saving manual attendee:", err);
      setGlobalError("A apărut o eroare la salvare. Încearcă din nou.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const requestDelete = (attendeeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setAttendeeToDelete(attendeeId);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!attendeeToDelete) return;
    const id = attendeeToDelete;
    const prevList = [...manualAttendees];
    setManualAttendees(prev => prev.filter(a => String(a.id) !== String(id)));
    setDeleteModalOpen(false);
    setAttendeeToDelete(null);
    try {
        await manualAttendeesService.remove(id);
    } catch (err) {
        setManualAttendees(prevList); 
        setGlobalError("Nu s-a putut șterge rezervarea.");
    }
  };

  // ... Review logic same as before ...
  const handleSaveReview = async () => {
      if (!event) return;
      const r = review.ratings;
      const errors: Record<string, boolean> = {};
      if (!review.recap || review.recap.length < 5) errors.recap = true;
      if (!r?.wineQuality) errors.wineQuality = true;
      if (!r?.foodQuality) errors.foodQuality = true;
      if (!r?.speedOfService) errors.speedOfService = true;
      if (!r?.atmosphere) errors.atmosphere = true;
      if (!r?.profitability) errors.profitability = true;
      if (Object.keys(errors).length > 0) { setReviewErrors(errors); return; }
      setReviewErrors({});
      setSavingReview(true);
      const saved = await postEventReviewsService.upsertByEvent(event.wp_event_id, {
          ratings: review.ratings as RatingMetrics,
          recap: review.recap!,
          tags: review.tags || [],
          notes: review.notes
      });
      setReview(saved);
      setLastSaved(saved.updatedAt);
      setSavingReview(false);
  };

  const updateRating = (key: keyof RatingMetrics, val: number) => {
      setReview(prev => ({ ...prev, ratings: { ...prev.ratings!, [key]: val } }));
  };
  const toggleTag = (tag: string) => {
      const currentTags = review.tags || [];
      const newTags = currentTags.includes(tag) ? currentTags.filter(t => t !== tag) : [...currentTags, tag];
      setReview({ ...review, tags: newTags });
  };
  const getStatusColor = (status: ManualStatus) => {
    switch(status) {
        case ManualStatus.CONFIRMAT: return 'bg-green-100 text-green-700 border-green-200';
        case ManualStatus.VENIT: return 'bg-blue-100 text-blue-700 border-blue-200';
        case ManualStatus.ANULAT: return 'bg-red-100 text-red-700 border-red-200';
        case ManualStatus.NOSHOW: return 'bg-gray-800 text-white';
        default: return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Se încarcă...</div>;
  if (!event) return <div className="p-8 text-center text-red-500">Evenimentul nu a fost găsit.</div>;

  return (
    <div className="space-y-6 pb-20">
      {globalError && (
        <div className="fixed bottom-4 right-4 z-[110] bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-4">
            <AlertTriangle size={20}/>
            <span className="font-medium text-sm">{globalError}</span>
            <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-white/20 rounded"><X size={16}/></button>
        </div>
      )}

      <DeleteConfirmationModal isOpen={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} onConfirm={confirmDelete}/>

      <button onClick={() => navigate('/')} className="flex items-center text-gray-500 hover:text-rose-700 transition">
        <ArrowLeft size={18} className="mr-1" /> Înapoi la calendar
      </button>

      {/* Header Info */}
      <div className={`rounded-xl shadow-sm border p-6 transition-colors ${totals.overbooked ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
            <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block px-2 py-1 rounded text-xs font-semibold bg-rose-50 text-rose-700 uppercase">
                        {event.event_type}
                    </span>
                    {totals.overbooked && (
                        <span className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-red-600 text-white uppercase animate-pulse">
                            <AlertTriangle size={12} /> OVERBOOKED
                        </span>
                    )}
                </div>
                <h1 className="text-2xl font-bold text-gray-900">{decodeHtml(event.title)}</h1>
                
                {/* AI Labels & Desc */}
                <div className="flex flex-wrap items-center gap-2 my-3">
                   {labelsLoading && !labels ? (
                     <div className="text-xs text-gray-400">Încărcare etichete...</div>
                   ) : labels ? (
                     <>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 border border-purple-100 rounded-full text-xs font-bold shadow-sm">
                           <Wine size={12}/> {labels.drinks_label}
                        </div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-xs font-bold shadow-sm">
                           <Tag size={12}/> {labels.theme_label}
                        </div>
                        <button onClick={handleRegenerateLabels} disabled={labelsLoading} className="ml-2 p-1 text-gray-400 hover:text-rose-600 transition rounded-full hover:bg-gray-100">
                           <RefreshCw size={14} className={labelsLoading ? 'animate-spin' : ''}/>
                        </button>
                     </>
                   ) : null}
                </div>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className={`text-sm text-gray-600 ${isDescExpanded ? '' : 'line-clamp-3'}`} dangerouslySetInnerHTML={{ __html: event.description }} />
                    <button onClick={() => setIsDescExpanded(!isDescExpanded)} className="flex items-center gap-1 text-xs font-bold text-rose-700 mt-2 hover:underline">
                        {isDescExpanded ? <><ChevronUp size={14}/> Restrânge</> : <><ChevronDown size={14}/> Vezi tot</>}
                    </button>
                </div>
            </div>

            <div className="flex gap-4 text-center items-start">
                <div className="bg-white/80 p-3 rounded-lg border border-gray-100 min-w-[80px]">
                    <div className="text-xs text-gray-500 uppercase">Site</div>
                    <div className="text-xl font-bold text-gray-800">{totals.wp}</div>
                </div>
                <div className="bg-rose-50 p-3 rounded-lg border border-rose-100 min-w-[80px]">
                    <div className="text-xs text-rose-700 uppercase">Manual</div>
                    <div className="text-xl font-bold text-rose-800">{totals.manual}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 min-w-[100px] shadow-sm ml-auto">
                    <div className="text-xs text-emerald-700 uppercase flex items-center gap-1 justify-center"><DollarSign size={12}/> Revenue</div>
                    <div className="text-xl font-bold text-emerald-800">{totals.revenue.toLocaleString()} RON</div>
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
            
            {/* WP Attendees with Real Payment Data */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                 <div className="flex justify-between items-center mb-4">
                     <div>
                       <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800"><Ticket size={18} className="text-blue-600"/> Bilete Online</h3>
                       <div className="text-xs text-gray-400 mt-1">
                          {payments.length} plăți sincronizate. {wpAttendees.length} participanți.
                       </div>
                     </div>
                     
                     <div className="flex items-center gap-2">
                       {syncResult?.success === false && (
                         <div className="text-xs text-red-500 font-bold bg-red-50 px-2 py-1 rounded flex items-center gap-1">
                           <AlertTriangle size={12}/> Eroare sync
                         </div>
                       )}
                       <button 
                         onClick={handleSyncPayments} 
                         disabled={syncingPayments}
                         className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold text-white transition shadow-sm ${syncingPayments ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                       >
                         {syncingPayments ? <Loader2 size={14} className="animate-spin"/> : <Database size={14}/>}
                         {syncingPayments ? 'Se sincronizează...' : 'Sincronizează Plăți'}
                       </button>
                     </div>
                 </div>

                 {/* Debug Info (Collapsible ideally, but showing if sync ran) */}
                 {syncResult && (
                   <div className="mb-4 bg-gray-50 border border-gray-200 p-3 rounded text-xs font-mono text-gray-600 overflow-x-auto">
                      <div className="font-bold mb-1">Last Sync Result:</div>
                      {JSON.stringify(syncResult.data || syncResult.error)}
                   </div>
                 )}

                 <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-3 py-2 text-left">Nume Cumpărător</th>
                                <th className="px-3 py-2 text-left">Bilet / Order</th>
                                <th className="px-3 py-2 text-right">Preț Listă</th>
                                <th className="px-3 py-2 text-right">Preț Real</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {wpAttendees.map(a => {
                                const payment = getPaymentForAttendee(a);
                                const hasDiscount = payment && (payment.unit_price_paid < a.price);
                                
                                return (
                                <tr key={a.attendeeId}>
                                    <td className="px-3 py-2">
                                        <div className="font-bold text-gray-900">{a.fullName || '(Nume lipsă)'}</div>
                                        <div className="text-xs text-gray-400">{a.email || '—'}</div>
                                    </td>
                                    <td className="px-3 py-2 text-gray-600">
                                      <div className="text-xs font-mono">#{a.ticketId} / Ord #{a.orderId}</div>
                                    </td>
                                    <td className="px-3 py-2 text-right text-gray-400">
                                       <span className={hasDiscount ? "line-through" : ""}>{a.price} RON</span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                       {payment ? (
                                           <div>
                                               <div className={`font-bold ${hasDiscount ? 'text-emerald-700' : 'text-gray-800'}`}>
                                                 {Number(payment.unit_price_paid).toFixed(2)} RON
                                               </div>
                                               
                                               {payment.coupon_codes && (
                                                   <div className="text-[10px] text-orange-600 bg-orange-50 px-1 rounded inline-block mt-0.5" title="Coupon Code">
                                                       🏷️ {payment.coupon_codes}
                                                   </div>
                                               )}
                                               
                                               {payment.discount_allocated > 0 && !payment.coupon_codes && (
                                                   <div className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded inline-block mt-0.5">
                                                       VIP Discount
                                                   </div>
                                               )}
                                           </div>
                                       ) : (
                                           <span className="text-xs text-gray-400 italic">Nesincronizat</span>
                                       )}
                                    </td>
                                </tr>
                                );
                            })}
                            {wpAttendees.length === 0 && <tr><td colSpan={4} className="text-center py-4 text-gray-400">Niciun bilet online.</td></tr>}
                        </tbody>
                    </table>
                 </div>
            </div>

            {/* Manual Attendees Section */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800"><Users size={18} className="text-rose-600"/> Participanți Manuali</h3>
                    <button 
                        type="button"
                        onClick={() => showAddForm ? resetForm() : setShowAddForm(true)}
                        className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded transition ${showAddForm ? 'bg-gray-200 text-gray-700' : 'bg-rose-600 text-white'}`}
                    >
                        {showAddForm ? <X size={16}/> : <Plus size={16}/>} {showAddForm ? 'Închide' : 'Adaugă'}
                    </button>
                </div>
                
                {showAddForm && (
                   <form onSubmit={handleManualSubmit} className="bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200">
                       <h4 className="text-sm font-bold mb-3">{editingId ? 'Edit' : 'Nou'}</h4>
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                           <input placeholder="Nume" required className="p-2 border rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                           <div className="flex gap-2">
                               <input type="number" min="1" className="w-20 p-2 border rounded" value={formData.quantity} onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})} />
                               <select className="flex-1 p-2 border rounded" value={formData.source} onChange={e => setFormData({...formData, source: e.target.value as ManualSource})}>
                                   {Object.values(ManualSource).map(s => <option key={s} value={s}>{s}</option>)}
                               </select>
                           </div>
                           <input placeholder="Telefon" className="p-2 border rounded" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} />
                           {editingId && (
                               <select className="p-2 border rounded" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value as ManualStatus})}>
                                   {Object.values(ManualStatus).map(s => <option key={s} value={s}>{s}</option>)}
                               </select>
                           )}
                       </div>
                       <input placeholder="Observații..." className="w-full p-2 border rounded mb-3" value={formData.notes || ''} onChange={e => setFormData({...formData, notes: e.target.value})} />
                       <button type="submit" disabled={isRefreshing} className="w-full bg-gray-900 text-white py-2 rounded font-bold hover:bg-black transition">
                           {isRefreshing ? 'Se salvează...' : 'Salvează'}
                       </button>
                   </form>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-3 py-2 text-left">Nume</th>
                                <th className="px-3 py-2 text-center">Pers</th>
                                <th className="px-3 py-2 text-center">Sursă</th>
                                <th className="px-3 py-2 text-center">Status</th>
                                <th className="px-3 py-2 text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {manualAttendees.map(a => (
                                <tr key={a.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 font-medium">{a.name}</td>
                                    <td className="px-3 py-2 text-center font-bold">{a.quantity}</td>
                                    <td className="px-3 py-2 text-center capitalize text-gray-500">{a.source}</td>
                                    <td className="px-3 py-2 text-center">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${getStatusColor(a.status)}`}>{a.status}</span>
                                    </td>
                                    <td className="px-3 py-2 text-right flex justify-end gap-1">
                                        <button onClick={() => startEdit(a)} className="text-gray-400 hover:text-blue-600"><Pencil size={16}/></button>
                                        <button onClick={(e) => requestDelete(a.id, e)} className="text-gray-400 hover:text-red-600"><Trash2 size={16}/></button>
                                    </td>
                                </tr>
                            ))}
                            {manualAttendees.length === 0 && <tr><td colSpan={5} className="text-center py-4 text-gray-400">Nicio rezervare manuală.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>

        {/* Sidebar: Reviews */}
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-rose-50 p-4 border-b border-rose-100 flex justify-between items-center">
                   <h3 className="font-bold text-rose-900 flex items-center gap-2"><CheckCircle2 size={18}/> Post-Event Review</h3>
                </div>
                <div className="p-6 space-y-6">
                   <div className="space-y-1">
                      <FaceRating label="Calitate Vin" value={review.ratings?.wineQuality || 0} onChange={v => updateRating('wineQuality', v)} />
                      <FaceRating label="Calitate Mâncare" value={review.ratings?.foodQuality || 0} onChange={v => updateRating('foodQuality', v)} />
                      <FaceRating label="Viteza Servirii" value={review.ratings?.speedOfService || 0} onChange={v => updateRating('speedOfService', v)} />
                      <FaceRating label="Atmosferă" value={review.ratings?.atmosphere || 0} onChange={v => updateRating('atmosphere', v)} />
                      <FaceRating label="Profitabilitate" value={review.ratings?.profitability || 0} onChange={v => updateRating('profitability', v)} />
                   </div>
                   <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rezumat</label>
                      <input className="w-full text-sm p-2 border rounded" placeholder="Rezumat..." value={review.recap || ''} onChange={e => setReview({...review, recap: e.target.value})} />
                   </div>
                   <button onClick={handleSaveReview} disabled={savingReview} className="w-full flex items-center justify-center gap-2 bg-rose-700 text-white font-bold py-3 rounded-lg hover:bg-rose-800 disabled:opacity-70">
                       {savingReview ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>} {savingReview ? 'Se salvează...' : 'Salvează Review'}
                   </button>
                </div>
            </div>
        </div>

      </div>
      
      {activeModal && event && <SmartModal type={activeModal} eventId={event.wp_event_id.toString()} description={event.description} onClose={() => setActiveModal(null)} />}
    </div>
  );
};

export default EventDetail;