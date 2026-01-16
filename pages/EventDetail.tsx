import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale/ro';
import { ArrowLeft, Users, Plus, Trash2, X, Phone, Ticket, AlertTriangle, ChevronDown, ChevronUp, Utensils, Wine, ChevronRight, Copy, Loader2, RefreshCw, Save, CheckCircle2, Pencil, Tag, Sparkles } from 'lucide-react';
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
             {copied ? <CheckCircle size={16}/> : <Copy size={16}/>}
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

// --- Main EventDetail Component ---

const CheckCircle = ({size}: {size:number}) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;

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
    notes: '',
    ticketPrice: undefined
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
      
      // Load Payments
      loadPayments(e);

      // 2. Load Manual Attendees (Async via Service)
      try {
        const manual = await manualAttendeesService.listByEvent(e.wp_event_id);
        setManualAttendees(manual);
      } catch (err) {
        console.error("Failed to load manual attendees", err);
        // Fallback or empty state
        setManualAttendees([]);
      }

      // 3. Load Review (Async via Service)
      try {
        const existingReview = await postEventReviewsService.getByEvent(e.wp_event_id);
        if (existingReview) {
            setReview(existingReview);
            setLastSaved(existingReview.updatedAt);
        } else {
            // Reset to defaults if no review found
            setReview({
                ratings: { wineQuality: 0, foodQuality: 0, speedOfService: 0, atmosphere: 0, profitability: 0 },
                recap: '',
                tags: [],
                notes: ''
            });
            setLastSaved(null);
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
    if (!event) return { wp: 0, manual: 0, total: 0, remaining: 0, percent: 0, overbooked: false, cap: 0, revenue: 0, onlineRevenue: 0, manualRevenue: 0 };
    
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

    // Compute Total Revenue with breakdown
    let onlineRevenue = 0;
    let manualRevenue = 0;
    
    // 1. Online Revenue (From Payments Table if available, else list price)
    if (payments.length > 0) {
        onlineRevenue = payments.reduce((sum, p) => sum + p.line_total_paid, 0);
    } else {
        // Fallback: list price * wp attendees count
        onlineRevenue = wp * (event.price || 0);
    }

    // 2. Manual Revenue: Sum up actual ticket prices * quantity for paid/confirmed attendees
    for (const ma of manualAttendees) {
        // Include REZERVAT, CONFIRMAT, and VENIT for revenue tracking
        if (ma.status === ManualStatus.REZERVAT || ma.status === ManualStatus.CONFIRMAT || ma.status === ManualStatus.VENIT) {
            const pricePerTicket = ma.ticketPrice ?? event.price ?? 0;
            const attendeeRevenue = pricePerTicket * ma.quantity;
            manualRevenue += attendeeRevenue;
            console.log(`[Revenue] Manual attendee ${ma.name}: ${ma.quantity} × ${pricePerTicket} = ${attendeeRevenue} RON (ticketPrice: ${ma.ticketPrice}, status: ${ma.status})`);
        }
    }

    console.log(`[Revenue] Online: ${onlineRevenue.toFixed(2)} RON, Manual: ${manualRevenue.toFixed(2)} RON, Total: ${(onlineRevenue + manualRevenue).toFixed(2)} RON`);

    const revenue = onlineRevenue + manualRevenue;

    return { wp, manual, total, remaining, percent, overbooked, cap, revenue, onlineRevenue, manualRevenue };
  }, [event, wpAttendees, manualAttendees, payments]);

  const getPaymentForAttendee = (attendee: AttendeeRecord) => {
      if (!payments.length) return null;
      // Match by Order ID
      // If an order has multiple line items, finding the exact one for this attendee is tricky 
      // because attendee record ticket_id sometimes matches product_id.
      // We will look for a payment record with the same order_id.
      // Simplification: Return the first payment for this order (assuming 1 ticket type per order mostly).
      // Or filter by unit price similarity?
      return payments.find(p => p.wp_order_id === String(attendee.orderId));
  };

  const resetForm = () => {
    setFormData({ quantity: 1, source: ManualSource.TELEFON, status: ManualStatus.REZERVAT, name: '', phone: '', email: '', notes: '', ticketPrice: undefined });
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
      notes: attendee.notes || '',
      ticketPrice: attendee.ticketPrice
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
        // UPDATE existing
        await manualAttendeesService.update(editingId, {
          name: formData.name,
          quantity: Number(formData.quantity) || 1,
          source: formData.source as ManualSource,
          status: formData.status as ManualStatus,
          phone: formData.phone,
          email: formData.email,
          notes: formData.notes,
          ticketPrice: formData.ticketPrice
        });
      } else {
        // CREATE new
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
          ticketPrice: formData.ticketPrice,
          created_by_user_id: currentUser?.id || 'unknown'
        });
      }
      
      resetForm();
      const updatedList = await manualAttendeesService.listByEvent(event.wp_event_id);
      setManualAttendees(updatedList);
    } catch (err) {
      console.error("Error saving manual attendee:", err);
      setGlobalError("A apărut o eroare la salvare. Încearcă din nou.");
      setTimeout(() => setGlobalError(null), 5000);
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
    setGlobalError(null);

    setManualAttendees(prev => prev.filter(a => String(a.id) !== String(id)));
    setDeleteModalOpen(false);
    setAttendeeToDelete(null);

    try {
        await manualAttendeesService.remove(id);
    } catch (err) {
        console.error("Error deleting attendee:", err);
        setManualAttendees(prevList); 
        setGlobalError("Nu s-a putut șterge rezervarea. Verifică conexiunea.");
        setTimeout(() => setGlobalError(null), 5000);
    }
  };

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

      if (Object.keys(errors).length > 0) {
          setReviewErrors(errors);
          return;
      }
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
      setReview(prev => ({
          ...prev,
          ratings: { ...prev.ratings!, [key]: val }
      }));
  };

  const toggleTag = (tag: string) => {
      const currentTags = review.tags || [];
      const newTags = currentTags.includes(tag) 
        ? currentTags.filter(t => t !== tag) 
        : [...currentTags, tag];
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
      {/* Error Toast */}
      {globalError && (
        <div className="fixed bottom-4 right-4 z-[110] bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-4">
            <AlertTriangle size={20}/>
            <span className="font-medium text-sm">{globalError}</span>
            <button onClick={() => setGlobalError(null)} className="p-1 hover:bg-white/20 rounded"><X size={16}/></button>
        </div>
      )}

      {/* Delete Modal */}
      <DeleteConfirmationModal 
         isOpen={deleteModalOpen} 
         onClose={() => setDeleteModalOpen(false)} 
         onConfirm={confirmDelete}
      />

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
                
                {/* AI Labels */}
                <div className="flex flex-wrap items-center gap-2 my-3">
                   {labelsLoading && !labels ? (
                     <>
                       <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-400 rounded-full text-xs font-medium animate-pulse">
                         <Wine size={12}/> Drinks: ...
                       </div>
                       <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-400 rounded-full text-xs font-medium animate-pulse">
                         <Tag size={12}/> Theme: ...
                       </div>
                     </>
                   ) : labels ? (
                     <>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 border border-purple-100 rounded-full text-xs font-bold shadow-sm">
                           <Wine size={12}/> {labels.drinks_label}
                        </div>
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full text-xs font-bold shadow-sm">
                           <Tag size={12}/> {labels.theme_label}
                        </div>
                        <button 
                           onClick={handleRegenerateLabels}
                           disabled={labelsLoading}
                           className="ml-2 p-1 text-gray-400 hover:text-rose-600 transition rounded-full hover:bg-gray-100"
                           title="Regenerează Etichete AI"
                        >
                           <RefreshCw size={14} className={labelsLoading ? 'animate-spin' : ''}/>
                        </button>
                     </>
                   ) : (
                     <div className="flex items-center gap-2">
                       <span className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12}/> Labels Error</span>
                       <button onClick={() => loadLabels(event)} className="text-xs text-rose-600 underline">Retry</button>
                     </div>
                   )}
                </div>

                <p className="text-gray-500 flex items-center gap-2 mt-1 mb-4">
                    <span className="capitalize">{format(new Date(event.start_datetime), 'EEEE, d MMMM yyyy • HH:mm', { locale: ro })}</span>
                    {event.price && <span>• {event.price} RON (List)</span>}
                </p>

                <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                    <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 min-w-0">
                             <div className={`text-sm text-gray-600 transition-all ${isDescExpanded ? '' : 'line-clamp-3'}`} dangerouslySetInnerHTML={{ __html: event.description }} />
                             <button 
                                onClick={() => setIsDescExpanded(!isDescExpanded)}
                                className="flex items-center gap-1 text-xs font-bold text-rose-700 mt-2 hover:underline focus:outline-none"
                             >
                                {isDescExpanded ? <><ChevronUp size={14}/> Restrânge</> : <><ChevronDown size={14}/> Vezi tot</>}
                             </button>
                        </div>
                        
                        <div className="md:w-64 shrink-0 flex flex-col gap-3 justify-start pt-4 md:pt-0 md:border-l md:border-gray-200 md:pl-6 border-t md:border-t-0 border-gray-200 mt-4 md:mt-0">
                                 <button 
                                     onClick={() => setActiveModal('food')}
                                     className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-orange-300 hover:bg-orange-50 transition group"
                                 >
                                     <div className="flex items-center gap-3">
                                          <div className="p-2 rounded-md transition shadow-sm bg-orange-100 text-orange-600 group-hover:bg-white group-hover:text-orange-500">
                                             <Utensils size={18} />
                                          </div>
                                          <div className="text-left">
                                             <div className="text-xs font-bold text-gray-700 group-hover:text-orange-800">Meniu Mâncare</div>
                                             <div className="text-[10px] text-gray-400 font-medium">Extragere AI</div>
                                          </div>
                                     </div>
                                     <ChevronRight size={14} className="text-gray-300 group-hover:text-orange-400"/>
                                 </button>

                                 <button 
                                     onClick={() => setActiveModal('wine')}
                                     className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-purple-300 hover:bg-purple-50 transition group"
                                 >
                                     <div className="flex items-center gap-3">
                                          <div className="p-2 rounded-md transition shadow-sm bg-purple-100 text-purple-600 group-hover:bg-white group-hover:text-purple-500">
                                             <Wine size={18} />
                                          </div>
                                          <div className="text-left">
                                             <div className="text-xs font-bold text-gray-700 group-hover:text-purple-800">Lista Vinuri</div>
                                             <div className="text-[10px] text-gray-400 font-medium">Extragere AI</div>
                                          </div>
                                     </div>
                                     <ChevronRight size={14} className="text-gray-300 group-hover:text-purple-400"/>
                                 </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 text-center items-stretch sm:items-start">
                <div className="flex gap-4 justify-center">
                    <div className="bg-white/80 p-3 rounded-lg border border-gray-100 min-w-[80px]">
                        <div className="text-xs text-gray-500 uppercase">Site</div>
                        <div className="text-xl font-bold text-gray-800">{totals.wp}</div>
                    </div>
                    <div className="bg-rose-50 p-3 rounded-lg border border-rose-100 min-w-[80px]">
                        <div className="text-xs text-rose-700 uppercase">Manual</div>
                        <div className="text-xl font-bold text-rose-800">{totals.manual}</div>
                    </div>
                    <div className={`p-3 rounded-lg min-w-[100px] shadow-lg ${totals.overbooked ? 'bg-red-600 text-white' : 'bg-gray-800 text-white'}`}>
                        <div className="text-xs opacity-80 uppercase">Total</div>
                        <div className="text-2xl font-bold">{totals.total} <span className="text-sm font-normal opacity-70">/ {totals.cap}</span></div>
                    </div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 shadow-sm sm:ml-auto">
                    <div className="text-xs text-emerald-700 uppercase flex items-center gap-1 justify-center">Total Venit</div>
                    <div className="text-2xl font-bold text-emerald-800">{totals.revenue.toLocaleString()} RON</div>
                    {(totals.onlineRevenue > 0 || totals.manualRevenue > 0) && (
                        <div className="text-[10px] text-emerald-600 mt-1 flex justify-between gap-2">
                            <span>Online: {totals.onlineRevenue.toLocaleString()}</span>
                            <span>Manual: {totals.manualRevenue.toLocaleString()}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2 overflow-hidden mt-2">
            <div className={`h-2.5 rounded-full transition-all duration-500 ${totals.overbooked ? 'bg-purple-600' : totals.percent >= 100 ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(totals.percent, 100)}%` }}></div>
        </div>
        <p className={`text-sm text-right font-medium ${totals.overbooked ? 'text-red-600' : 'text-gray-500'}`}>
            Grad de ocupare: {totals.percent}% {totals.overbooked ? `(Depășit cu ${totals.total - totals.cap} pers)` : totals.remaining <= 0 ? '(FULL)' : `(${totals.remaining} locuri libere)`}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <div className="lg:col-span-2 space-y-6">
            {/* Manual Attendees */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800"><Users size={18} className="text-rose-600"/> Participanți Manuali</h3>
                    <button 
                        type="button"
                        onClick={() => showAddForm ? resetForm() : setShowAddForm(true)}
                        className={`flex items-center gap-1 text-sm px-3 py-1.5 rounded transition ${showAddForm ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-rose-600 text-white hover:bg-rose-700'}`}
                    >
                        {showAddForm ? <X size={16}/> : <Plus size={16}/>} {showAddForm ? 'Închide' : 'Adaugă'}
                    </button>
                </div>

                {showAddForm && (
                    <form onSubmit={handleManualSubmit} className="bg-gray-50 p-5 rounded-lg mb-4 border border-gray-200 animate-in fade-in slide-in-from-top-2">
                        <h4 className="text-sm font-bold text-gray-800 mb-3 border-b pb-2 border-gray-200">
                          {editingId ? 'Editează Rezervare' : 'Adaugă Rezervare Nouă'}
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nume Client</label>
                                <input required 
                                    className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 outline-none" 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})} 
                                />
                            </div>
                            
                            <div className="flex gap-4">
                                <div className="w-24">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nr. Pers</label>
                                    <input type="number" min="1" 
                                        className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 outline-none" 
                                        value={formData.quantity} 
                                        onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})} 
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Sursă</label>
                                    <select 
                                        className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 outline-none" 
                                        value={formData.source} 
                                        onChange={e => setFormData({...formData, source: e.target.value as ManualSource})}
                                    >
                                        {Object.values(ManualSource).map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Telefon</label>
                                <input 
                                    className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 outline-none" 
                                    value={formData.phone || ''} 
                                    onChange={e => setFormData({...formData, phone: e.target.value})} 
                                />
                            </div>
                            
                            {editingId && (
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Status</label>
                                <select 
                                    className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 outline-none" 
                                    value={formData.status} 
                                    onChange={e => setFormData({...formData, status: e.target.value as ManualStatus})}
                                >
                                    {Object.values(ManualStatus).map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                                </select>
                            </div>
                            )}
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Preț Bilet (RON/persoană)</label>
                                <input 
                                    type="number" 
                                    min="0" 
                                    step="0.01"
                                    placeholder={event?.price ? `${event.price} (preț listă)` : 'Preț bilet'}
                                    className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 outline-none" 
                                    value={formData.ticketPrice ?? ''} 
                                    onChange={e => setFormData({...formData, ticketPrice: e.target.value ? parseFloat(e.target.value) : undefined})} 
                                />
                                {formData.quantity && formData.quantity > 1 && formData.ticketPrice && (
                                    <div className="text-xs text-emerald-600 font-bold mt-1">
                                        Total grup: {(formData.ticketPrice * formData.quantity).toFixed(2)} RON
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Observații (ex: alergii, masa preferată)</label>
                                <input 
                                    className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900 focus:ring-2 focus:ring-rose-500 outline-none" 
                                    value={formData.notes || ''} 
                                    onChange={e => setFormData({...formData, notes: e.target.value})} 
                                />
                            </div>
                        </div>
                        
                        <div className="flex gap-3">
                          <button type="button" onClick={resetForm} className="flex-1 bg-white border border-gray-300 text-gray-700 py-2.5 rounded text-sm font-bold hover:bg-gray-50 transition">
                              Anulează
                          </button>
                          <button type="submit" disabled={isRefreshing} className="flex-1 bg-gray-900 text-white py-2.5 rounded text-sm font-bold hover:bg-black transition shadow-sm disabled:opacity-70 flex justify-center gap-2 items-center">
                              {isRefreshing && <Loader2 size={16} className="animate-spin"/>}
                              {editingId ? 'Actualizează Rezervarea' : 'Salvează Rezervarea'}
                          </button>
                        </div>
                    </form>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-3 py-2 text-left">Nume</th>
                                <th className="px-3 py-2 text-center">Pers</th>
                                <th className="px-3 py-2 text-right">Preț</th>
                                <th className="px-3 py-2 text-center">Sursă</th>
                                <th className="px-3 py-2 text-center">Status</th>
                                <th className="px-3 py-2 text-right">Acțiuni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {manualAttendees.map(a => (
                                <tr key={a.id} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 font-medium text-gray-900">
                                        {a.name}
                                        {a.notes && <div className="text-xs text-orange-600 font-normal mt-0.5 bg-orange-50 inline-block px-1 rounded">{a.notes}</div>}
                                        <div className="flex gap-2 text-gray-400 text-xs mt-0.5">
                                            {a.phone && <span className="flex items-center"><Phone size={10} className="mr-0.5"/>{a.phone}</span>}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold text-gray-800">{a.quantity}</td>
                                    <td className="px-3 py-2 text-right text-gray-900">
                                        {a.ticketPrice ? (
                                            <div>
                                                <div className="font-bold text-emerald-700">{(a.ticketPrice * a.quantity).toFixed(2)} RON</div>
                                                <div className="text-[10px] text-gray-500">{a.ticketPrice.toFixed(2)} RON × {a.quantity}</div>
                                            </div>
                                        ) : event?.price ? (
                                            <div>
                                                <div className="font-bold text-gray-600">{(event.price * a.quantity).toFixed(2)} RON</div>
                                                <div className="text-[10px] text-gray-400">{event.price.toFixed(2)} RON × {a.quantity} (listă)</div>
                                            </div>
                                        ) : (
                                            <div className="text-gray-400 text-xs italic">-</div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 text-center text-gray-500 capitalize">{a.source}</td>
                                    <td className="px-3 py-2 text-center">
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold border ${getStatusColor(a.status)}`}>
                                            {a.status}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <div className="flex justify-end gap-1">
                                          <button type="button" onClick={() => startEdit(a)} className="text-gray-400 hover:text-blue-600 p-1 transition-colors" title="Editează">
                                            <Pencil size={16}/>
                                          </button>
                                          <button type="button" onClick={(e) => requestDelete(a.id, e)} className="text-gray-400 hover:text-red-600 p-1 transition-colors" title="Șterge">
                                            <Trash2 size={16}/>
                                          </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {manualAttendees.length === 0 && <tr><td colSpan={6} className="text-center py-4 text-gray-400">Nicio rezervare manuală.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* WP Attendees */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                 <div className="flex justify-between items-center mb-4">
                     <h3 className="font-bold text-lg flex items-center gap-2 text-gray-800"><Ticket size={18} className="text-blue-600"/> Bilete Online</h3>
                     {payments.length === 0 && wpAttendees.length > 0 && (
                         <span className="text-xs text-gray-400 italic">Încă nu s-au sincronizat plățile...</span>
                     )}
                 </div>
                 <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-500">
                            <tr>
                                <th className="px-3 py-2 text-left">Nume Cumpărător</th>
                                <th className="px-3 py-2 text-right">Preț Real Plătit</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {wpAttendees.map(a => {
                                const payment = getPaymentForAttendee(a);
                                return (
                                <tr key={a.attendeeId}>
                                    <td className="px-3 py-2">
                                        <div className="font-bold text-gray-900">{a.fullName || '(Nume lipsă)'}</div>
                                        <div className="text-xs text-gray-400">{a.email || '—'}</div>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                       {payment ? (
                                           <div>
                                               <div className="font-bold text-emerald-700">{payment.unit_price_paid.toFixed(2)} RON</div>
                                               {payment.coupon_codes && (
                                                   <div className="text-[10px] text-orange-600 bg-orange-50 px-1 rounded inline-block" title={`Coupon: ${payment.coupon_codes}`}>
                                                       🏷️ {payment.coupon_codes}
                                                   </div>
                                               )}
                                               {payment.discount_allocated && payment.discount_allocated > 0 && !payment.coupon_codes ? (
                                                   <div className="text-[10px] text-blue-600">VIP Discount</div>
                                               ) : null}
                                           </div>
                                       ) : (
                                           <div className="text-gray-400 text-xs italic">
                                               {a.price > 0 ? `${a.price} RON (List)` : '-'}
                                           </div>
                                       )}
                                    </td>
                                </tr>
                                );
                            })}
                            {wpAttendees.length === 0 && <tr><td colSpan={2} className="text-center py-4 text-gray-400">Niciun bilet online încă.</td></tr>}
                        </tbody>
                    </table>
                 </div>
            </div>
        </div>

        {/* Sidebar: Post-Event Review */}
        <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-rose-50 p-4 border-b border-rose-100 flex justify-between items-center">
                   <h3 className="font-bold text-rose-900 flex items-center gap-2">
                     <CheckCircle2 size={18}/> Post-Event Review
                   </h3>
                   {lastSaved && (
                     <span className="text-[10px] text-rose-700 opacity-70">Salvat: {format(new Date(lastSaved), 'dd/MM HH:mm')}</span>
                   )}
                </div>
                
                <div className="p-6 space-y-6">
                   {/* 1. Ratings */}
                   <div className="space-y-1">
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Evaluare Generală</label>
                      <FaceRating label="Calitate Vin" value={review.ratings?.wineQuality || 0} onChange={v => updateRating('wineQuality', v)} error={reviewErrors.wineQuality} />
                      <FaceRating label="Calitate Mâncare" value={review.ratings?.foodQuality || 0} onChange={v => updateRating('foodQuality', v)} error={reviewErrors.foodQuality} />
                      <FaceRating label="Viteza Servirii" value={review.ratings?.speedOfService || 0} onChange={v => updateRating('speedOfService', v)} error={reviewErrors.speedOfService} />
                      <FaceRating label="Atmosferă" value={review.ratings?.atmosphere || 0} onChange={v => updateRating('atmosphere', v)} error={reviewErrors.atmosphere} />
                      <FaceRating label="Profitabilitate" value={review.ratings?.profitability || 0} onChange={v => updateRating('profitability', v)} error={reviewErrors.profitability} />
                   </div>

                   {/* 2. One Line Recap */}
                   <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Rezumat în 1 propoziție <span className="text-red-500">*</span></label>
                      <input 
                         className={`w-full text-sm p-2 border rounded-lg focus:ring-1 outline-none transition ${reviewErrors.recap ? 'border-red-300 ring-red-200 bg-red-50' : 'border-gray-300 focus:ring-rose-500 bg-white'}`}
                         placeholder="Ex: O seară agitată dar profitabilă..."
                         value={review.recap || ''}
                         onChange={e => setReview({...review, recap: e.target.value})}
                      />
                      {reviewErrors.recap && <p className="text-xs text-red-500 mt-1">Acest câmp este obligatoriu (min 5 caractere).</p>}
                   </div>

                   {/* 3. Tags */}
                   <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Motive (de ce a mers / n-a mers)</label>
                       <div className="flex flex-wrap gap-2">
                           {Object.values(NoteTagReason).map(t => (
                               <button 
                                   key={t} 
                                   onClick={() => toggleTag(t)}
                                   className={`text-[10px] px-2.5 py-1 border rounded-full transition-all duration-200 
                                     ${(review.tags || []).includes(t) 
                                       ? 'bg-rose-900 text-white border-rose-900 font-medium shadow-sm' 
                                       : 'text-gray-500 border-gray-200 hover:border-gray-400 hover:bg-gray-50'}`}
                               >
                                   {t}
                               </button>
                           ))}
                       </div>
                   </div>

                   {/* 4. Notes */}
                   <div>
                       <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Observații (opțional)</label>
                       <textarea 
                           className="w-full text-sm border border-gray-300 rounded-lg p-3 focus:ring-1 focus:ring-rose-500 outline-none bg-white min-h-[100px]" 
                           rows={4} 
                           placeholder="Observații (opțional)..."
                           value={review.notes || ''}
                           onChange={e => setReview({...review, notes: e.target.value})}
                       ></textarea>
                   </div>

                   <button 
                       onClick={handleSaveReview}
                       disabled={savingReview}
                       className="w-full flex items-center justify-center gap-2 bg-rose-700 hover:bg-rose-800 text-white font-bold py-3 rounded-lg shadow-md transition disabled:opacity-70 disabled:cursor-not-allowed"
                   >
                       {savingReview ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
                       {savingReview ? 'Se salvează...' : 'Salvează Review'}
                   </button>
                </div>
            </div>
        </div>

      </div>
      
      {activeModal && event && (
        <SmartModal 
          type={activeModal} 
          eventId={event.wp_event_id.toString()} 
          description={event.description} 
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
};

export default EventDetail;