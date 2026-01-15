
import { wpClient } from "./wpClient";
import { WPTicketPayment } from "../types";
import { paymentsService } from "./paymentsService";

// Helper to chunk array
const chunkArray = (arr: any[], size: number) => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );
};

export const wooOrdersService = {

  /**
   * Orchestrates the fetching and processing of orders based on a list of Order IDs.
   * Smart Sync: Checks Supabase first and only fetches missing orders.
   */
  async syncPaymentsForOrders(orderIds: (string | number)[]): Promise<void> {
    if (orderIds.length === 0) return;

    // 1. Deduplicate and Stringify
    const uniqueIds = Array.from(new Set(orderIds.map(String)));
    
    console.log(`[WooSync] Analyzing ${uniqueIds.length} candidate orders for payment sync...`);

    // 2. Check which ones we already have in Supabase
    const existingSet = await paymentsService.getExistingOrderIds(uniqueIds);
    
    // 3. Filter missing
    const missingIds = uniqueIds.filter(id => !existingSet.has(id));

    if (missingIds.length === 0) {
        console.log("[WooSync] All orders already synced. Skipping fetch.");
        return;
    }

    console.log(`[WooSync] Fetching ${missingIds.length} missing orders from WooCommerce...`);

    // 4. Fetch missing from WooCommerce in chunks
    const CHUNK_SIZE = 15;
    const chunks = chunkArray(missingIds, CHUNK_SIZE);

    let processedCount = 0;

    for (const chunk of chunks) {
      try {
        const orders = await this.fetchOrdersByIds(chunk);
        const payments = this.processOrders(orders);
        if (payments.length > 0) {
          await paymentsService.upsertBatch(payments);
          processedCount += payments.length;
        }
      } catch (e) {
        console.error("[WooSync] Error processing chunk:", e);
      }
    }
    
    console.log(`[WooSync] Sync complete. Upserted ${processedCount} payment records.`);
  },

  /**
   * Fetch specific orders from WC API.
   */
  async fetchOrdersByIds(ids: string[]): Promise<any[]> {
    if (ids.length === 0) return [];
    
    // WC API V3 supports 'include' parameter
    const response = await wpClient.wpGet('wp-json/wc/v3/orders', {
      include: ids.join(','),
      per_page: 100
    });

    return Array.isArray(response.data) ? response.data : [];
  },

  /**
   * Transform WC Order objects into WPTicketPayment records.
   * Extracts real paid amounts, applying coupons/discounts logic.
   */
  processOrders(orders: any[]): Partial<WPTicketPayment>[] {
    const results: Partial<WPTicketPayment>[] = [];

    for (const order of orders) {
      // Only care about paid orders usually, but tribe often generates attendees even for pending.
      // We store whatever we get, but paid_at is useful info.
      
      const orderId = String(order.id);
      const couponCodes = order.coupon_lines 
        ? order.coupon_lines.map((c: any) => c.code).join(', ') 
        : '';
      const paidAt = order.date_paid || order.date_created;

      if (!order.line_items) continue;

      for (const item of order.line_items) {
        // Try to identify Event ID.
        // Tribe Tickets typically stores '_event_id' in meta_data.
        let eventId = '';
        
        // Strategy 1: Check meta_data
        const metaEvent = item.meta_data?.find((m: any) => m.key === '_event_id' || m.key === 'event_id' || m.key === '_tribe_wooticket_for_event');
        if (metaEvent) {
          eventId = String(metaEvent.value);
        }

        // Strategy 2: Fallback - if product_id is the event_id (unlikely for Tribe, but possible for simple Woo setups)
        // or if SKU contains it. Skipping complex heuristic for now, assuming Tribe standard.
        
        if (!eventId) {
           // If we can't link it to an event, we skip this line item 
           // (it might be shipping, or a non-ticket product)
           continue; 
        }

        const qty = parseInt(item.quantity || '0');
        if (qty === 0) continue;

        const lineTotal = parseFloat(item.total || '0'); // Total after discount, before tax (usually)
        // Note: 'total' in WC REST API usually excludes tax unless prices entered with tax. 
        // For revenue tracking, we generally want what the customer put in our pocket.
        // 'total' is line total after discounts.
        
        const lineSubtotal = parseFloat(item.subtotal || '0'); // Before discount
        const unitPricePaid = lineTotal / qty;
        const discountAllocated = lineSubtotal - lineTotal;

        results.push({
          wp_event_id: eventId,
          wp_order_id: orderId,
          wp_order_item_id: String(item.id),
          qty: qty,
          currency: order.currency || 'RON',
          line_total_paid: lineTotal,
          unit_price_paid: unitPricePaid,
          line_subtotal: lineSubtotal,
          discount_allocated: discountAllocated,
          coupon_codes: couponCodes,
          order_total: parseFloat(order.total || '0'),
          paid_at: paidAt,
          raw: { sku: item.sku, name: item.name } // Minimal debug info
        });
      }
    }

    return results;
  }
};
