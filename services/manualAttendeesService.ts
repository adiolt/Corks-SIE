import { supabase } from "./supabaseClient";
import { db } from "./storage";
import { ManualAttendee, ManualStatus } from "../types";

// Helper to check if Supabase is configured (rudimentary check based on client existence)
const isSupabaseConfigured = () => !!supabase;

// Helper to convert from Supabase snake_case to camelCase
const fromSupabase = (data: any): ManualAttendee => {
  const { ticket_price, ...rest } = data;
  return {
    ...rest,
    ticketPrice: ticket_price
  };
};

// Helper to convert from camelCase to Supabase snake_case
const toSupabase = (data: any) => {
  const { ticketPrice, ...rest } = data;
  return {
    ...rest,
    ticket_price: ticketPrice
  };
};

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
        // Convert from snake_case to camelCase
        const attendees = data.map(fromSupabase);
        // Cache for offline use
        attendees.forEach(a => db.cacheManualAttendee(a));
        return attendees;
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
        const attendees = data.map(fromSupabase);
        db.saveAllManualAttendees(attendees);
        return attendees;
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
        .insert(toSupabase(attendee)) // Convert to snake_case
        .select()
        .single();

      if (!error && data) {
        // Convert back to camelCase and cache
        const attendeeRecord = fromSupabase(data);
        db.cacheManualAttendee(attendeeRecord);
        return attendeeRecord;
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
        .update(toSupabase(patch)) // Convert to snake_case
        .eq('id', id)
        .select()
        .single();

      if (!error && data) {
        const attendeeRecord = fromSupabase(data);
        db.cacheManualAttendee(attendeeRecord);
        return attendeeRecord;
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