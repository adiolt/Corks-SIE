
import { supabase } from "./supabaseClient";
import { WPTicketPayment } from "../types";

const isSupabaseConfigured = () => !!supabase;

// Helper to chunk array
const chunkArray = (arr: any[], size: number) => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );
};

export const paymentsService = {
  
  /**
   * Upsert a batch of payments.
   * Relies on unique constraint (wp_order_id, wp_order_item_id).
   */
  async upsertBatch(payments: Partial<WPTicketPayment>[]): Promise<void> {
    if (!isSupabaseConfigured() || payments.length === 0) return;

    // Supabase allows bulk upsert
    const { error } = await supabase
      .from('wp_ticket_payments')
      .upsert(payments, { onConflict: 'wp_order_id, wp_order_item_id' });

    if (error) {
      console.error("Error upserting payments:", error.message);
    } else {
      console.log(`[Payments] Successfully upserted ${payments.length} records.`);
    }
  },

  /**
   * Get payments for a specific event.
   */
  async getByEventId(wpEventId: number | string): Promise<WPTicketPayment[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await supabase
      .from('wp_ticket_payments')
      .select('*')
      .eq('wp_event_id', String(wpEventId));

    if (error) {
      console.error(`Error fetching payments for event ${wpEventId}:`, error.message);
      return [];
    }
    
    return data as WPTicketPayment[];
  },

  /**
   * Get all payments (for dashboard/history revenue calculation).
   */
  async getAll(): Promise<WPTicketPayment[]> {
    if (!isSupabaseConfigured()) return [];

    const { data, error } = await supabase
      .from('wp_ticket_payments')
      .select('*');

    if (error) {
      console.error('Error fetching all payments:', error.message);
      return [];
    }
    
    return data as WPTicketPayment[];
  },

  /**
   * Check if we have payments for a list of Order IDs (to avoid re-fetching).
   * Returns Set of order_ids that exist.
   * Batches requests to handle large numbers of IDs.
   */
  async getExistingOrderIds(orderIds: string[]): Promise<Set<string>> {
    if (!isSupabaseConfigured() || orderIds.length === 0) return new Set();

    const uniqueIds = Array.from(new Set(orderIds));
    const existingSet = new Set<string>();
    
    // Chunk to avoid "Request Line is too large" (Supabase REST limit)
    const chunks = chunkArray(uniqueIds, 100);

    for (const chunk of chunks) {
        const { data, error } = await supabase
          .from('wp_ticket_payments')
          .select('wp_order_id')
          .in('wp_order_id', chunk);

        if (!error && data) {
            data.forEach(d => existingSet.add(d.wp_order_id));
        } else if (error) {
            console.error("Error checking existing orders:", error.message);
        }
    }

    return existingSet;
  }
};
