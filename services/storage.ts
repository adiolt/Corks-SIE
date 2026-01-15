
import { AppSettings, EventNote, ManualAttendee, User, WPAttendee, WPEvent, ManualStatus, EventType, AttendeeRecord, SyncState, AttendeeSnapshot, GlobalSyncState, PostEventReview } from "../types";
import { SEED_EVENTS, MOCK_USERS, EVENT_KEYWORDS } from "../constants";

// Keys for LocalStorage
const K_EVENTS = 'corks_events';
const K_WP_ATTENDEES_FLAT = 'corks_wp_attendees'; // Deprecated
const K_ATTENDEES_MAP = 'corks_attendees_map'; // Record<eventId, AttendeeRecord[]>
const K_SYNC_STATE_MAP = 'corks_sync_state_map'; // Record<eventId, SyncState>
const K_SNAPSHOTS_MAP = 'corks_snapshots_map'; // Record<eventId, AttendeeSnapshot[]>
const K_GLOBAL_SYNC = 'corks_global_sync';

const K_MANUAL_ATTENDEES = 'corks_manual_attendees';
const K_NOTES = 'corks_notes';
const K_REVIEWS = 'corks_reviews'; // New Key for PostEventReviews
const K_SETTINGS = 'corks_settings';
const K_USER = 'corks_auth_user';

// Helper to generate UUIDs
const uuid = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

class StorageService {
  // --- Initialization & Seeding ---
  constructor() {
    this.seedIfEmpty();
    this.migrateIfNeeded();
  }

  private seedIfEmpty() {
    if (!localStorage.getItem(K_EVENTS)) {
      const seededEvents: WPEvent[] = SEED_EVENTS.map(e => ({
        id: uuid(),
        ...e,
        last_synced_at: new Date().toISOString()
      }));
      localStorage.setItem(K_EVENTS, JSON.stringify(seededEvents));
    }
    if (!localStorage.getItem(K_SETTINGS)) {
      const defaultSettings: AppSettings = {
        apiKey: '',
        siteUrl: 'https://corks.ro',
        syncInterval: 5,
        capacityOverride: false,
        wpClientMode: 'server'
      };
      localStorage.setItem(K_SETTINGS, JSON.stringify(defaultSettings));
    }
    if (!localStorage.getItem(K_MANUAL_ATTENDEES)) {
      localStorage.setItem(K_MANUAL_ATTENDEES, JSON.stringify([]));
    }
  }

  private migrateIfNeeded() {
    // Ensure new maps exist
    if (!localStorage.getItem(K_ATTENDEES_MAP)) localStorage.setItem(K_ATTENDEES_MAP, '{}');
    if (!localStorage.getItem(K_SYNC_STATE_MAP)) localStorage.setItem(K_SYNC_STATE_MAP, '{}');
    if (!localStorage.getItem(K_SNAPSHOTS_MAP)) localStorage.setItem(K_SNAPSHOTS_MAP, '{}');
    if (!localStorage.getItem(K_GLOBAL_SYNC)) localStorage.setItem(K_GLOBAL_SYNC, JSON.stringify({ lastDailyFullSyncDate: '', lastDeltaSyncRunUtc: '' }));
    if (!localStorage.getItem(K_REVIEWS)) localStorage.setItem(K_REVIEWS, '{}');
  }

  // --- Events ---
  getEvents(): WPEvent[] {
    const raw = localStorage.getItem(K_EVENTS);
    return raw ? JSON.parse(raw) : [];
  }

  getEvent(id: string): WPEvent | undefined {
    return this.getEvents().find(e => e.id === id);
  }
  
  saveEvents(events: WPEvent[]) {
    localStorage.setItem(K_EVENTS, JSON.stringify(events));
  }

  // --- Attendees (New Map Structure) ---
  
  getAttendeesForEvent(eventId: number): AttendeeRecord[] {
    const map = this.getAttendeesMap();
    return map[eventId] || [];
  }

  saveAttendeesForEvent(eventId: number, attendees: AttendeeRecord[]) {
    const map = this.getAttendeesMap();
    map[eventId] = attendees;
    localStorage.setItem(K_ATTENDEES_MAP, JSON.stringify(map));
  }

  private getAttendeesMap(): Record<number, AttendeeRecord[]> {
    const raw = localStorage.getItem(K_ATTENDEES_MAP);
    return raw ? JSON.parse(raw) : {};
  }

  /**
   * Upsert logic: Merges new delta records into existing cache based on attendeeId
   */
  upsertAttendees(eventId: number, newRecords: AttendeeRecord[]) {
    const map = this.getAttendeesMap();
    const existing = map[eventId] || [];
    
    // Create map for easy lookup
    const lookup = new Map(existing.map(a => [a.attendeeId, a]));
    
    // Update or Add
    newRecords.forEach(r => {
      lookup.set(r.attendeeId, r);
    });
    
    // Convert back to array and sort
    const merged = Array.from(lookup.values()).sort((a, b) => 
      new Date(a.createdUtc).getTime() - new Date(b.createdUtc).getTime()
    );

    map[eventId] = merged;
    localStorage.setItem(K_ATTENDEES_MAP, JSON.stringify(map));
    return merged;
  }

  // --- Sync State ---
  
  getSyncState(eventId: number): SyncState {
    const map = JSON.parse(localStorage.getItem(K_SYNC_STATE_MAP) || '{}');
    return map[eventId] || {};
  }

  updateSyncState(eventId: number, newState: Partial<SyncState>) {
    const map = JSON.parse(localStorage.getItem(K_SYNC_STATE_MAP) || '{}');
    map[eventId] = { ...(map[eventId] || {}), ...newState };
    localStorage.setItem(K_SYNC_STATE_MAP, JSON.stringify(map));
  }

  getGlobalSyncState(): GlobalSyncState {
    return JSON.parse(localStorage.getItem(K_GLOBAL_SYNC) || '{}');
  }

  getLastSync(): string | null {
    const state = this.getGlobalSyncState();
    return state.lastDeltaSyncRunUtc || null;
  }

  updateGlobalSyncState(updates: Partial<GlobalSyncState>) {
    const current = this.getGlobalSyncState();
    localStorage.setItem(K_GLOBAL_SYNC, JSON.stringify({ ...current, ...updates }));
  }

  // --- Snapshots ---

  addSnapshot(eventId: number, totalOnline: number) {
    const map = JSON.parse(localStorage.getItem(K_SNAPSHOTS_MAP) || '{}');
    const list: AttendeeSnapshot[] = map[eventId] || [];
    
    list.push({ capturedUtc: new Date().toISOString(), totalOnline });
    
    // Keep max 400
    if (list.length > 400) {
      list.shift(); // remove oldest
    }
    
    map[eventId] = list;
    localStorage.setItem(K_SNAPSHOTS_MAP, JSON.stringify(map));
  }

  // --- Legacy / Manual ---

  getWPAttendees(wpEventId: number): WPAttendee[] {
     const records = this.getAttendeesForEvent(wpEventId);
     return records.map(r => ({
       id: `wp_${r.attendeeId}`,
       wp_attendee_id: r.attendeeId,
       wp_event_id: r.eventId,
       ticket_name: 'Bilet Online',
       quantity: 1,
       status: 'completed',
       purchaser_name: r.fullName,
       purchaser_email: r.email,
       last_synced_at: r.modifiedUtc
     }));
  }
  
  saveWPAttendees(newAttendees: WPAttendee[]) {
    console.warn("Using deprecated saveWPAttendees. Please use saveAttendeesForEvent.");
  }

  getManualAttendees(wpEventId: number): ManualAttendee[] {
    const raw = localStorage.getItem(K_MANUAL_ATTENDEES);
    const all: ManualAttendee[] = raw ? JSON.parse(raw) : [];
    return all.filter(a => a.wp_event_id === wpEventId);
  }

  getAllManualAttendees(): ManualAttendee[] {
    const raw = localStorage.getItem(K_MANUAL_ATTENDEES);
    return raw ? JSON.parse(raw) : [];
  }

  /**
   * Directly saves a list of manual attendees to local storage.
   * Useful for syncing from Supabase.
   */
  saveAllManualAttendees(attendees: ManualAttendee[]) {
    localStorage.setItem(K_MANUAL_ATTENDEES, JSON.stringify(attendees));
  }

  // Local CRUD (Pure, no Supabase side effects)
  async addManualAttendee(attendee: Omit<ManualAttendee, 'id' | 'created_at'>): Promise<ManualAttendee> {
    const newAttendee: ManualAttendee = {
      ...attendee,
      id: uuid(),
      created_at: new Date().toISOString()
    };
    
    const all = this.getAllManualAttendees();
    all.push(newAttendee);
    localStorage.setItem(K_MANUAL_ATTENDEES, JSON.stringify(all));
    return newAttendee;
  }
  
  // Directly cache a full object (from Supabase)
  cacheManualAttendee(attendee: ManualAttendee) {
    const all = this.getAllManualAttendees();
    // Loose comparison for ID to handle number vs string mismatch
    const idx = all.findIndex(a => String(a.id) === String(attendee.id));
    if (idx >= 0) {
        all[idx] = attendee;
    } else {
        all.push(attendee);
    }
    localStorage.setItem(K_MANUAL_ATTENDEES, JSON.stringify(all));
  }

  async updateManualAttendee(id: string, updates: Partial<ManualAttendee>) {
    const raw = localStorage.getItem(K_MANUAL_ATTENDEES);
    let all: ManualAttendee[] = raw ? JSON.parse(raw) : [];
    all = all.map(a => String(a.id) === String(id) ? { ...a, ...updates } : a);
    localStorage.setItem(K_MANUAL_ATTENDEES, JSON.stringify(all));
  }

  async deleteManualAttendee(id: string) {
    const raw = localStorage.getItem(K_MANUAL_ATTENDEES);
    let all: ManualAttendee[] = raw ? JSON.parse(raw) : [];
    // CRITICAL FIX: Convert both IDs to strings for comparison
    // Supabase returns IDs as numbers (int), but app treats them as strings.
    all = all.filter(a => String(a.id) !== String(id));
    localStorage.setItem(K_MANUAL_ATTENDEES, JSON.stringify(all));
  }

  // --- Notes ---
  getEventNotes(wpEventId: number): EventNote[] {
    const raw = localStorage.getItem(K_NOTES);
    const all: EventNote[] = raw ? JSON.parse(raw) : [];
    return all.filter(n => n.wp_event_id === wpEventId);
  }

  addEventNote(note: Omit<EventNote, 'id' | 'created_at'>) {
    const raw = localStorage.getItem(K_NOTES);
    const all: EventNote[] = raw ? JSON.parse(raw) : [];
    const newNote: EventNote = {
      ...note,
      id: uuid(),
      created_at: new Date().toISOString()
    };
    all.push(newNote);
    localStorage.setItem(K_NOTES, JSON.stringify(all));
  }

  // --- Post Event Reviews ---
  
  getPostEventReview(wpEventId: number): PostEventReview | null {
    const mapRaw = localStorage.getItem(K_REVIEWS);
    const map: Record<number, PostEventReview> = mapRaw ? JSON.parse(mapRaw) : {};
    return map[wpEventId] || null;
  }

  savePostEventReview(review: Omit<PostEventReview, 'id' | 'createdAt' | 'updatedAt'> & { id?: string, createdAt?: string }) {
    const mapRaw = localStorage.getItem(K_REVIEWS);
    const map: Record<number, PostEventReview> = mapRaw ? JSON.parse(mapRaw) : {};
    
    const existing = map[review.eventId];
    const now = new Date().toISOString();
    const reviewId = existing?.id || review.id || uuid();

    const finalReview: PostEventReview = {
        ...review,
        id: reviewId,
        createdAt: existing?.createdAt || now,
        updatedAt: now
    };

    map[review.eventId] = finalReview;
    localStorage.setItem(K_REVIEWS, JSON.stringify(map));
    return finalReview;
  }
  
  cachePostEventReview(review: PostEventReview) {
    const mapRaw = localStorage.getItem(K_REVIEWS);
    const map: Record<number, PostEventReview> = mapRaw ? JSON.parse(mapRaw) : {};
    map[review.eventId] = review;
    localStorage.setItem(K_REVIEWS, JSON.stringify(map));
  }

  // --- Auth ---
  login(email: string): User | null {
    const user = MOCK_USERS.find(u => u.email === email);
    if (user) {
      localStorage.setItem(K_USER, JSON.stringify(user));
      return user;
    }
    return null;
  }

  logout() {
    localStorage.removeItem(K_USER);
  }

  getCurrentUser(): User | null {
    const raw = localStorage.getItem(K_USER);
    return raw ? JSON.parse(raw) : null;
  }

  // --- Settings ---
  getSettings(): AppSettings {
    const raw = localStorage.getItem(K_SETTINGS);
    const settings = raw ? JSON.parse(raw) : { apiKey: '', siteUrl: 'https://corks.ro', syncInterval: 5, capacityOverride: false };
    return settings;
  }

  saveSettings(settings: AppSettings) {
    localStorage.setItem(K_SETTINGS, JSON.stringify(settings));
  }
}

export const db = new StorageService();
