
import { supabase } from "./supabaseClient";
import { WPTicketPayment } from "../types";

const isSupabaseConfigured = () => !!supabase;

export const paymentsService = {
  
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
   * Check which order IDs already exist in the database.
   * Useful for delta syncing.
   */
  async getExistingOrderIds(orderIds: string[]): Promise<Set<string>> {
    if (!isSupabaseConfigured() || orderIds.length === 0) return new Set();

    const { data, error } = await supabase
      .from('wp_ticket_payments')
      .select('wp_order_id')
      .in('wp_order_id', orderIds);

    if (error) {
      console.error("Error fetching existing order IDs:", error.message);
      return new Set();
    }

    const found = new Set<string>();
    if (data) {
        data.forEach((row: any) => {
            if (row.wp_order_id) found.add(String(row.wp_order_id));
        });
    }
    return found;
  },

  /**
   * Batch upsert payments (Legacy/Direct use).
   */
  async upsertBatch(payments: Partial<WPTicketPayment>[]): Promise<void> {
    if (!isSupabaseConfigured() || payments.length === 0) return;

    const { error } = await supabase
      .from('wp_ticket_payments')
      .upsert(payments, { onConflict: 'wp_order_id, wp_order_item_id' });

    if (error) {
        console.error("Error batch upserting payments:", error.message);
        throw new Error(error.message);
    }
  },

  /**
   * Invokes the Supabase Edge Function to fetch orders securely from server-side.
   */
  async syncPaymentsViaEdge(wpEventId: string, orderIds: string[]): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    if (!isSupabaseConfigured()) {
      return { success: false, error: "Supabase not configured" };
    }

    if (orderIds.length === 0) {
      return { success: true, data: { message: "No orders to sync" } };
    }

    // Unique IDs only
    const uniqueOrders = Array.from(new Set(orderIds));

    try {
      const { data, error } = await supabase.functions.invoke('sync-payments', {
        body: {
          wp_event_id: wpEventId,
          orders: uniqueOrders.map(id => ({ wp_order_id: id }))
        }
      });

      if (error) {
        console.error("Edge Function Error:", error);
        
        // Improve DX: Check for common 404/500 errors indicating missing function
        const msg = error.message || '';
        if (msg.includes("Failed to send") || msg.includes("not found") || msg.includes("500")) {
            return { 
                success: false, 
                error: "Funcția 'sync-payments' nu este accesibilă. Te rog rulează 'npx supabase functions deploy sync-payments'." 
            };
        }
        
        return { success: false, error: msg };
      }

      return { success: true, data };
    } catch (e: any) {
      console.error("Sync Exception:", e);
      return { success: false, error: e.message };
    }
  }
};
