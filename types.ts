

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  STAFF = 'staff'
}

export enum EventType {
  DEGUSTARE = 'degustare vin',
  MASTERCLASS = 'masterclass',
  PAIRING = 'pairing',
  WHISKY = 'whisky',
  ROM = 'rom',
  COCKTAIL = 'cocktail',
  SPECIAL = 'special',
  ALTUL = 'altul'
}

export enum ManualSource {
  TELEFON = 'telefon',
  EMAIL = 'email',
  WALKIN = 'walk-in',
  SOCIAL = 'social media',
  INFLUENCER = 'influencer',
  IALOC = 'ialoc'
}

export enum ManualStatus {
  REZERVAT = 'rezervat',
  CONFIRMAT = 'confirmat',
  ANULAT = 'anulat',
  NOSHOW = 'no-show',
  VENIT = 'venit'
}

export enum NoteTagReason {
  PRET = 'pret',
  ZI_ORA = 'zi-ora',
  TEMA = 'tema',
  COMUNICARE = 'comunicare',
  VREME = 'vreme',
  CONCURENTA = 'concurenta',
  LEAD_TIME = 'lead-time mic',
  FORMAT = 'format',
  ALTUL = 'altul'
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface WPEvent {
  id: string; // internal UUID
  wp_event_id: number;
  title: string;
  description: string;
  start_datetime: string; // ISO string
  end_datetime?: string; // ISO string
  price?: number;
  event_type: EventType;
  wine_focus?: string;
  capacity?: number;
  last_synced_at: string;
  
  // Computed on frontend join
  wp_attendees_count?: number; 
  manual_attendees_count?: number;
  
  // Extracted Data (Deterministic)
  extracted_wines?: string[];
  extracted_menu?: string[];
}

// Internal Normalized Attendee Record
export interface AttendeeRecord {
  attendeeId: string | number;
  eventId: number;
  ticketId: string | number;
  orderId: string | number;
  fullName: string;
  email: string;
  createdUtc: string; // ISO
  modifiedUtc: string; // ISO
  checkedIn: boolean;
  provider: string; // 'Tribe__Tickets__RSVP' or 'Tribe__Tickets_Plus__Commerce__WooCommerce__Main' etc
  isPurchaser: boolean;
  price: number;
  rawPayload: any;
}

// Deprecated but kept for type compatibility during migration if needed
export interface WPAttendee {
  id: string;
  wp_attendee_id: string | number;
  wp_event_id: number;
  ticket_name: string;
  quantity: number;
  status: string;
  purchaser_name?: string;
  purchaser_email?: string;
  last_synced_at: string;
}

export interface ManualAttendee {
  id: string;
  wp_event_id: number;
  name: string;
  phone?: string;
  email?: string;
  quantity: number;
  source: ManualSource;
  status: ManualStatus;
  notes?: string;
  created_by_user_id: string;
  created_at: string;
}

export interface WPTicketPayment {
  id: string;
  wp_event_id: string;
  wp_order_id: string;
  wp_order_item_id: string;
  qty: number;
  line_total_paid: number;
  unit_price_paid: number;
  line_subtotal?: number;
  discount_allocated?: number;
  coupon_codes?: string;
  paid_at?: string;
  created_at?: string;
  currency?: string;
  order_total?: number;
  raw?: any;
}

export interface EventNote {
  id: string;
  wp_event_id: number;
  tag_reason: NoteTagReason[];
  comment: string;
  added_by_user_id: string;
  created_at: string;
}

// --- NEW REVIEW SYSTEM ---

export interface RatingMetrics {
  wineQuality: number;
  foodQuality: number;
  speedOfService: number;
  atmosphere: number;
  profitability: number;
}

export interface PostEventReview {
  id: string;
  eventId: number; // wp_event_id
  ratings: RatingMetrics;
  tags: string[]; // Stores NoteTagReason strings
  recap: string;
  notes?: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// --- AI LABELS ---

export type DrinksLabel = 
  | "Vin Roșu" 
  | "Vin Alb" 
  | "Vin Rose" 
  | "Vin Spumant" 
  | "Vin Mix" 
  | "Spirtoase" 
  | "Others";

export type ThemeLabel = 
  | "Gastronomic Events" 
  | "Crame Romanesti" 
  | "Crame internationale" 
  | "Regiuni viti-vinicole" 
  | "Zile Nationale" 
  | "Soiuri" 
  | "Styles" 
  | "Expert" 
  | "Social/Party";

export interface EventLabelsRow {
  id: string;
  event_id: number;
  drinks_label: DrinksLabel;
  theme_label: ThemeLabel;
  confidence?: number | null;
  reasoning?: string | null;
  source?: string | null;
  model?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AppSettings {
  apiKey: string; // Kept for legacy compatibility
  siteUrl: string;
  syncInterval: number; // minutes
  capacityOverride: boolean;
  wpClientMode?: 'server' | 'direct';
}

// Sync Logic Types
export interface SyncState {
  lastFullSyncUtc?: string;
  lastDeltaSyncUtc?: string;
  lastSeenTotal?: number;
}

export interface AttendeeSnapshot {
  capturedUtc: string;
  totalOnline: number;
}

export interface GlobalSyncState {
  lastDailyFullSyncDate: string; // YYYY-MM-DD (Bucharest Time)
  lastDeltaSyncRunUtc: string;
}