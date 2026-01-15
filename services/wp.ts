
import { db } from "./storage";
import { AppSettings, EventType, AttendeeRecord, WPEvent } from "../types";
import { EVENT_KEYWORDS } from "../constants";
import { wpClient } from "./wpClient";
import { extractWinesAndFoodsFromDescription } from "../utils/eventDescriptionExtractor";
import { wooOrdersService } from "./wooOrdersService";

// --- HELPERS ---

const classifyEvent = (title: string, desc: string): EventType => {
  const text = (title + " " + desc).toLowerCase();
  for (const [key, type] of Object.entries(EVENT_KEYWORDS)) {
    if (text.includes(key)) return type;
  }
  return EventType.ALTUL;
};

// DEV TOGGLE: Set to true to log available keys for debugging API responses
const DEBUG_WP = false;

// --- CORE DATA FETCHING ---

/**
 * Fetch Public Events List (Unauthenticated/Public Endpoint)
 */
const fetchEventsList = async (settings: AppSettings): Promise<any[]> => {
  const response = await wpClient.wpGet('wp-json/tribe/events/v1/events', { per_page: 50 });
  return response.data.events || response.data || [];
};

/**
 * Fetch Attendees Per Event (Authenticated)
 * Handles "after" parameter for delta syncs.
 */
const fetchAttendeesForEvent = async (eventId: number, args?: { afterUtc?: string }): Promise<{ attendees: AttendeeRecord[]; total?: number; totalPages?: number }> => {
  const query: Record<string, string | number> = {
    post_id: eventId,
    per_page: 100
  };
  
  if (args?.afterUtc) {
    query.after = args.afterUtc;
  }

  const result = await wpClient.wpGetAllPages('wp-json/tribe/tickets/v1/attendees', query);
  
  const mapped: AttendeeRecord[] = result.items.map((item: any) => {
    if (DEBUG_WP) {
        // Log keys to identify where data is hiding without leaking PII
        console.log(`[WP_DEBUG] Item Keys for ID ${item.id}:`, Object.keys(item));
    }

    // --- DETERMINISTIC NAME RESOLUTION HELPER ---
    
    const normalize = (str: any): string => {
        if (str === null || str === undefined) return '';
        const s = String(str).trim();
        // Treat literal "N/A" as empty so we fallback to better options
        if (s === '' || s.toUpperCase() === 'N/A') return '';
        return s;
    };

    const prettifyEmailLocalPart = (email: any): string => {
        const e = normalize(email);
        if (!e) return 'N/A';
        const local = e.split('@')[0];
        
        // 1. Replace separators with spaces
        let s = local.replace(/[._-]/g, ' ');
        
        // 2. Collapse spaces
        s = s.replace(/\s+/g, ' ').trim();
        
        // 3. Title Case Words
        if (s.length > 0) {
            return s.split(' ')
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(' ');
        }
        return local;
    };

    const getAttendeeDisplayName = (i: any): string => {
        // Priority 1: Title (Canonical Name in Tribe API)
        const title = normalize(i.title);
        if (title) return title;

        // Priority 2: Composite Names provided by API
        const composite = normalize(i.purchaser_name) || normalize(i.full_name) || normalize(i.name);
        if (composite) return composite;

        // Priority 3: Specific Billing Fields (Strict: Only if BOTH exist)
        const bFirst = normalize(i.billing_first_name);
        const bLast = normalize(i.billing_last_name);
        if (bFirst && bLast) return `${bFirst} ${bLast}`;

        // Priority 4: Email Fallback (Prettified)
        return prettifyEmailLocalPart(i.email || i.purchaser_email);
    };

    const resolvedName = getAttendeeDisplayName(item);
    const email = item.purchaser_email || item.email || '';

    return {
      attendeeId: item.id,
      eventId: parseInt(item.post_id || item.event_id || eventId),
      ticketId: item.ticket_id,
      orderId: item.order_id || item.order,
      fullName: resolvedName,
      email: email,
      createdUtc: item.date_utc || new Date().toISOString(),
      modifiedUtc: item.modified_utc || new Date().toISOString(),
      checkedIn: !!item.checkin_status || !!item.checked_in,
      provider: item.provider || 'unknown',
      isPurchaser: !!item.is_purchaser,
      price: parseFloat(item.ticket?.raw_price || 0),
      rawPayload: item
    };
  });

  // Sort: createdUtc asc
  mapped.sort((a, b) => new Date(a.createdUtc).getTime() - new Date(b.createdUtc).getTime());

  return {
    attendees: mapped,
    total: result.totals?.total,
    totalPages: result.totals?.totalPages
  };
};

// --- SYNC SCHEDULER & ORCHESTRATOR ---

class SyncScheduler {
  getBucharestDate(): string {
    return new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Europe/Bucharest',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  getBucharestHour(): number {
    const str = new Intl.DateTimeFormat('en-GB', { 
      timeZone: 'Europe/Bucharest',
      hour: 'numeric', hour12: false
    }).format(new Date());
    return parseInt(str, 10);
  }

  shouldRunDailyFullSync(lastRunDate: string): boolean {
    const today = this.getBucharestDate();
    const hour = this.getBucharestHour();
    return (lastRunDate !== today && hour >= 7);
  }

  shouldRunDeltaSync(lastRunUtc: string): boolean {
    if (!lastRunUtc) return true;
    const diffMs = new Date().getTime() - new Date(lastRunUtc).getTime();
    return diffMs > (15 * 60 * 1000); // 15 minutes
  }
}

const scheduler = new SyncScheduler();
let isSyncing = false;

export const syncEvents = async (): Promise<{ success: boolean; message?: string }> => {
  if (isSyncing) return { success: false, message: "Sync in progress..." };
  isSyncing = true;

  try {
    const settings = db.getSettings();
    const globalState = db.getGlobalSyncState();
    const today = scheduler.getBucharestDate();
    
    console.log("Sync: Refreshing Events List...");
    const rawEvents = await fetchEventsList(settings);
    const existingEvents = db.getEvents();
    const processedEvents: WPEvent[] = [];

    for (const raw of rawEvents) {
      const existing = existingEvents.find(e => e.wp_event_id === raw.id);
      
      // Perform extraction
      const { wines, foods } = extractWinesAndFoodsFromDescription(raw.description || '');

      const event: WPEvent = {
        id: existing ? existing.id : Math.random().toString(36).substring(7),
        wp_event_id: raw.id,
        title: raw.title,
        description: raw.description,
        start_datetime: raw.start_date_details ? 
            `${raw.start_date_details.year}-${raw.start_date_details.month}-${raw.start_date_details.day}T${raw.start_date_details.hour}:${raw.start_date_details.minutes}:00` : 
            raw.start_date,
        end_datetime: raw.end_date,
        price: raw.cost_details?.values?.[0] ? parseFloat(raw.cost_details.values[0]) : (raw.cost ? parseFloat(raw.cost) : 0),
        event_type: existing?.event_type || classifyEvent(raw.title, raw.description),
        wine_focus: existing?.wine_focus || "", 
        capacity: raw.capacity || raw.global_stock_cap || null,
        last_synced_at: new Date().toISOString(),
        
        // Add extracted data
        extracted_wines: wines,
        extracted_menu: foods
      };
      processedEvents.push(event);
    }
    db.saveEvents(processedEvents);

    const runFull = scheduler.shouldRunDailyFullSync(globalState.lastDailyFullSyncDate);
    const runDelta = scheduler.shouldRunDeltaSync(globalState.lastDeltaSyncRunUtc);
    const isFirstRun = !globalState.lastDailyFullSyncDate;
    
    const now = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const relevantEvents = processedEvents.filter(e => {
        const start = new Date(e.start_datetime);
        return start >= ninetyDaysAgo;
    });

    const upcomingEvents = processedEvents.filter(e => new Date(e.start_datetime) >= now);

    // Collect Order IDs for Payment Sync
    const orderIdsToSync: Set<string | number> = new Set();

    if (runFull || isFirstRun) {
        console.log("Starting DAILY FULL SYNC for relevant events...");
        for (const event of relevantEvents) {
            try {
                const { attendees, total } = await fetchAttendeesForEvent(event.wp_event_id);
                db.saveAttendeesForEvent(event.wp_event_id, attendees);
                
                db.updateSyncState(event.wp_event_id, { 
                    lastFullSyncUtc: new Date().toISOString(),
                    lastSeenTotal: total
                });
                db.addSnapshot(event.wp_event_id, attendees.length);
            } catch (err) {
                console.error(`Full sync failed for event ${event.wp_event_id}`, err);
            }
        }
        db.updateGlobalSyncState({ 
            lastDailyFullSyncDate: today,
            lastDeltaSyncRunUtc: new Date().toISOString()
        });
    } 
    else if (runDelta) {
        console.log("Starting DELTA SYNC for upcoming events...");
        for (const event of upcomingEvents) {
            try {
                const state = db.getSyncState(event.wp_event_id);
                const lastSync = state.lastDeltaSyncUtc || state.lastFullSyncUtc;
                const deltaArgs = lastSync ? { afterUtc: lastSync } : undefined;

                const { attendees, total } = await fetchAttendeesForEvent(event.wp_event_id, deltaArgs);
                
                if (attendees.length > 0) {
                    const merged = db.upsertAttendees(event.wp_event_id, attendees);
                    db.addSnapshot(event.wp_event_id, merged.length);
                }
                
                db.updateSyncState(event.wp_event_id, { 
                    lastDeltaSyncUtc: new Date().toISOString(),
                    lastSeenTotal: total
                });
            } catch (err) {
                console.error(`Delta sync failed for event ${event.wp_event_id}`, err);
            }
        }
        db.updateGlobalSyncState({ lastDeltaSyncRunUtc: new Date().toISOString() });
    }

    // BACKFILL STRATEGY:
    // Always collect Order IDs from *all* local attendees for relevant events.
    // wooOrdersService is now smart enough to filter out orders that already exist in Supabase,
    // so this won't cause excessive API calls.
    for (const event of relevantEvents) {
        const cachedAttendees = db.getAttendeesForEvent(event.wp_event_id);
        cachedAttendees.forEach(a => {
            if (a.orderId) orderIdsToSync.add(a.orderId);
        });
    }

    // Trigger Payment Sync for collected orders
    if (orderIdsToSync.size > 0) {
      // Async fire and forget to not block UI success message too long, 
      // OR await it if we want "Sync Complete" to mean *everything* is done.
      // Awaiting it is safer for data consistency.
      await wooOrdersService.syncPaymentsForOrders(Array.from(orderIdsToSync));
    }

    isSyncing = false;
    return { success: true, message: "Sync complet." };

  } catch (error: any) {
    isSyncing = false;
    console.error("Critical Sync Error:", error);
    return { success: false, message: `Eroare sync: ${error.message}` };
  }
};
