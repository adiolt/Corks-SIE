import { supabase } from "./supabaseClient";
import { db } from "./storage";
import { ManualAttendee, ManualStatus } from "../types";

// Helper to check if Supabase is configured (rudimentary check based on client existence)
const isSupabaseConfigured = () => !!supabase;

export const manualAttendeesService = {
  
  /**
   * List all manual attendees for a specific event.
   */
  async listByEvent(wpEventId: number): Promise<ManualAttendee[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('manual_attendees')
        .select('*')
        .eq('wp_event_id', wpEventId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        // Cache for offline use
        // Note: This replaces the list. A merge strategy might be better but for MVP this ensures consistency.
        // We iterate and cache each one.
        data.forEach(a => db.cacheManualAttendee(a as ManualAttendee));
        return data as ManualAttendee[];
      }
      console.warn("Supabase fetch error (listByEvent), falling back to local:", error);
    }
    return db.getManualAttendees(wpEventId);
  },

  /**
   * Fetch ALL manual attendees (useful for Dashboard to avoid N+1 queries).
   */
  async getAll(): Promise<ManualAttendee[]> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('manual_attendees')
        .select('*');

      if (!error && data) {
        db.saveAllManualAttendees(data as ManualAttendee[]);
        return data as ManualAttendee[];
      }
    }
    return db.getAllManualAttendees();
  },

  /**
   * Add a new manual attendee.
   */
  async add(attendee: Omit<ManualAttendee, 'id' | 'created_at' | 'updated_at'>): Promise<ManualAttendee> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('manual_attendees')
        .insert(attendee) // Supabase generates ID and created_at
        .select()
        .single();

      if (!error && data) {
        // Update local cache with the authoritative record from DB
        db.cacheManualAttendee(data as ManualAttendee);
        return data as ManualAttendee;
      }
      console.error("Supabase add error:", error);
    }

    // Fallback to local storage (generates local ID)
    return db.addManualAttendee(attendee);
  },

  /**
   * Update an existing attendee.
   */
  async update(id: string, patch: Partial<ManualAttendee>): Promise<ManualAttendee | null> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('manual_attendees')
        .update(patch)
        .eq('id', id)
        .select()
        .single();

      if (!error && data) {
        db.cacheManualAttendee(data as ManualAttendee);
        return data as ManualAttendee;
      }
      console.error("Supabase update error:", error);
    }

    // Fallback
    await db.updateManualAttendee(id, patch);
    const updated = db.getAllManualAttendees().find(a => a.id === id);
    return updated || null;
  },

  /**
   * Remove an attendee.
   */
  async remove(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const { error } = await supabase
        .from('manual_attendees')
        .delete()
        .eq('id', id);
      
      if (error) {
        console.error("Supabase delete error:", error);
        throw error; // Propagate error so UI knows
      }
    }
    // Always remove from local cache
    await db.deleteManualAttendee(id);
  },

  /**
   * Calculate total quantity for an event (excluding cancelled/no-show).
   */
  async sumQuantityByEvent(wpEventId: number): Promise<number> {
    // 1. Try Supabase
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('manual_attendees')
        .select('quantity, status')
        .eq('wp_event_id', wpEventId);

      if (!error && data) {
        return data
          .filter(a => ![ManualStatus.ANULAT, ManualStatus.NOSHOW].includes(a.status as ManualStatus))
          .reduce((sum, a) => sum + a.quantity, 0);
      }
    }

    // 2. Fallback
    return db.getManualAttendees(wpEventId)
      .filter(a => ![ManualStatus.ANULAT, ManualStatus.NOSHOW].includes(a.status))
      .reduce((sum, a) => sum + a.quantity, 0);
  }
};