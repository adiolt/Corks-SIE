
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
   * Fetch product metadata to build product_id → event_id mapping.
   * The Events Calendar / Event Tickets store the event association in product meta.
   */
  async fetchProductEventMapping(productIds: number[]): Promise<Record<string, string>> {
    if (productIds.length === 0) {
      console.log('[WooSync] No products to map');
      return {};
    }

    console.log(`[WooSync] Building product→event mapping for ${productIds.length} products...`);
    const mapping: Record<string, string> = {};

    try {
      // Fetch product details in chunks
      const CHUNK_SIZE = 50;
      const chunks = chunkArray(productIds, CHUNK_SIZE);

      console.log(`[WooSync] Fetching ${chunks.length} chunks of products...`);
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(`[WooSync] Fetching chunk ${i + 1}/${chunks.length}: ${chunk.length} products`);
        
        const response = await wpClient.wpGet('wp-json/wc/v3/products', {
          include: chunk.join(','),
          per_page: CHUNK_SIZE
        });

        const products = Array.isArray(response.data) ? response.data : [];
        console.log(`[WooSync] Received ${products.length} products from API`);

        for (const product of products) {
          // Look for event ID in product metadata
          // The Events Calendar / Event Tickets use these meta fields:
          const eventMeta = product.meta_data?.find((m: any) => 
            m.key === '_tribe_wooticket_for_event' ||  // Primary key used by Event Tickets
            m.key === '_event_id' ||                     // Alternative
            m.key === 'event_id' ||                      // Alternative
            m.key === '_EventOrigin'                     // The Events Calendar origin field
          );

          if (eventMeta && eventMeta.value) {
            mapping[String(product.id)] = String(eventMeta.value);
            console.log(`[WooSync] ✓ Product ${product.id} (${product.name}) → Event ${eventMeta.value}`);
          } else {
            console.warn(`[WooSync] ✗ Product ${product.id} (${product.name}) has no event association`);
            if (product.meta_data && product.meta_data.length > 0) {
              console.warn(`[WooSync]   Available meta keys: ${product.meta_data.map((m: any) => m.key).slice(0, 10).join(', ')}`);
            } else {
              console.warn(`[WooSync]   No meta_data found on product`);
            }
          }
        }
      }

      console.log(`[WooSync] Product→Event mapping complete: ${Object.keys(mapping).length}/${productIds.length} products mapped`);
      if (Object.keys(mapping).length > 0) {
        console.log('[WooSync] Sample mappings:', Object.entries(mapping).slice(0, 3));
      }
    } catch (e) {
      console.error('[WooSync] Error fetching product event mapping:', e);
      if (e instanceof Error) {
        console.error('[WooSync] Error details:', e.message);
      }
    }

    return mapping;
  },

  /**
   * Build order→event mapping by querying attendees (most reliable method)
   * Since attendees already have order_id and event_id, we can use them directly
   */
  async fetchOrderEventMappingFromAttendees(orderIds: (string | number)[]): Promise<Record<string, string>> {
    const mapping: Record<string, string> = {};
    
    try {
      const { data: attendees, error } = await supabase
        .from('wp_attendees')
        .select('order_id, event_id')
        .in('order_id', orderIds.map(String));

      if (error) {
        console.error('[WooSync] Error fetching attendees for order mapping:', error);
        return mapping;
      }

      if (attendees) {
        for (const att of attendees) {
          if (att.order_id && att.event_id) {
            mapping[att.order_id] = String(att.event_id);
          }
        }
      }

      console.log(`[WooSync] Attendee-based mapping: ${Object.keys(mapping).length} orders mapped`);
    } catch (e) {
      console.error('[WooSync] Exception fetching attendee mapping:', e);
    }

    return mapping;
  },

  /**
   * Orchestrates the fetching and processing of orders based on a list of Order IDs.
   * Smart Sync: Checks Supabase first and only fetches missing orders.
   * @param force If true, re-processes all orders even if they exist in Supabase
   */
  async syncPaymentsForOrders(orderIds: (string | number)[], force = false): Promise<void> {
    if (orderIds.length === 0) return;

    // 1. Deduplicate and Stringify
    const uniqueIds = Array.from(new Set(orderIds.map(String)));
    
    console.log(`[WooSync] Analyzing ${uniqueIds.length} candidate orders for payment sync...`);

    // 2. Check which ones we already have in Supabase
    let missingIds = uniqueIds;
    
    if (!force) {
      const existingSet = await paymentsService.getExistingOrderIds(uniqueIds);
      
      // 3. Filter missing
      missingIds = uniqueIds.filter(id => !existingSet.has(id));

      if (missingIds.length === 0) {
          console.log("[WooSync] All orders already synced. Skipping fetch.");
          return;
      }
    } else {
      console.log(`[WooSync] Force mode: Re-processing all ${uniqueIds.length} orders...`);
    }

    console.log(`[WooSync] Fetching ${missingIds.length} missing orders from WooCommerce...`);

    // 4. Fetch missing from WooCommerce in chunks
    const CHUNK_SIZE = 15;
    const chunks = chunkArray(missingIds, CHUNK_SIZE);

    let processedCount = 0;
    const allOrders: any[] = [];

    // Fetch all orders first
    for (const chunk of chunks) {
      try {
        const orders = await this.fetchOrdersByIds(chunk);
        console.log(`[WooSync] Fetched ${orders.length} orders in chunk`);
        allOrders.push(...orders);
      } catch (e) {
        console.error("[WooSync] Error fetching chunk:", e);
      }
    }

    console.log(`[WooSync] Total orders fetched: ${allOrders.length}`);

    // 5. Extract product IDs from all orders
    const productIds = new Set<number>();
    for (const order of allOrders) {
      if (order.line_items) {
        for (const item of order.line_items) {
          if (item.product_id) {
            productIds.add(item.product_id);
          }
        }
      }
    }

    console.log(`[WooSync] Extracted ${productIds.size} unique product IDs from orders`);

    // 6. Build order→event mapping using attendee data (most reliable method)
    console.log('[WooSync] Building order→event mapping from attendee data...');
    const orderEventMap = await this.fetchOrderEventMappingFromAttendees(Array.from(uniqueIds));
    console.log(`[WooSync] Mapped ${Object.keys(orderEventMap).length} orders to events via attendees`);

    // 7. Fallback: Try product→event mapping for unmapped orders
    const unmappedOrders = allOrders.filter(o => !orderEventMap[o.id]);
    if (unmappedOrders.length > 0) {
      console.log(`[WooSync] ${unmappedOrders.length} orders not mapped via attendees, trying product mapping...`);
      
      if (productIds.size > 0) {
        const productEventMap = await this.fetchProductEventMapping(Array.from(productIds));
        console.log(`[WooSync] Built product mapping with ${Object.keys(productEventMap).length} entries`);
        
        // Add product-based mappings for unmapped orders
        for (const order of unmappedOrders) {
          for (const item of order.line_items || []) {
            if (item.product_id && productEventMap[item.product_id]) {
              orderEventMap[order.id] = productEventMap[item.product_id];
              console.log(`[WooSync] Order ${order.id} → Event ${orderEventMap[order.id]} (via product)`);
              break; // Use first matched product
            }
          }
        }
      }
    }

    // 8. Process orders with the mapping
    const payments = this.processOrders(allOrders, orderEventMap);
    console.log(`[WooSync] Processed ${payments.length} payment records from orders`);
    if (payments.length > 0) {
      await paymentsService.upsertBatch(payments);
      processedCount = payments.length;
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
   * Now uses order→event mapping instead of product→event mapping
   */
  processOrders(orders: any[], orderEventMap: Record<string, string> = {}): Partial<WPTicketPayment>[] {
    const results: Partial<WPTicketPayment>[] = [];

    for (const order of orders) {
      // Only care about paid orders usually, but tribe often generates attendees even for pending.
      // We store whatever we get, but paid_at is useful info.
      
      const orderId = String(order.id);
      
      // Check if we have event mapping for this order
      const eventId = orderEventMap[orderId];
      
      if (!eventId) {
        console.warn(`[WooSync] Order ${orderId}: No event mapping found, skipping`);
        continue;
      }
      
      const couponCodes = order.coupon_lines 
        ? order.coupon_lines.map((c: any) => c.code).join(', ') 
        : '';
      const paidAt = order.date_paid || order.date_created;

      if (!order.line_items || order.line_items.length === 0) {
        console.warn(`[WooSync] Order ${orderId}: No line items`);
        continue;
      }

      // Calculate total from line items for this event
      let totalQuantity = 0;
      let subtotal = 0;
      let total = 0;

      for (const item of order.line_items) {
        const qty = parseInt(item.quantity || '0');
        if (qty === 0) continue;

        const lineTotal = parseFloat(item.total || '0'); // Total after discount, before tax (usually)
        // Note: 'total' in WC REST API usually excludes tax unless prices entered with tax. 
        // For revenue tracking, we generally want what the customer put in our pocket.
        // 'total' is line total after discounts.
        
        const lineSubtotal = parseFloat(item.subtotal || '0'); // Before discount
        const unitPricePaid = lineTotal / qty;
        const discountAllocated = lineSubtotal - lineTotal;

        totalQuantity += qty;
        subtotal += lineSubtotal;
        total += lineTotal;
      }

      if (totalQuantity === 0) {
        console.warn(`[WooSync] Order ${orderId}: No valid line items with quantity`);
        continue;
      }

      // Calculate per-unit values
      const unitPricePaid = total / totalQuantity;
      const discountAllocated = subtotal - total;

      // Create one payment record per order for this event
      results.push({
        wp_event_id: eventId,
        wp_order_id: orderId,
        wp_order_item_id: String(order.line_items[0].id), // Use first line item ID
        qty: totalQuantity,
        currency: order.currency || 'RON',
        line_total_paid: total,
        unit_price_paid: unitPricePaid,
        line_subtotal: subtotal,
        discount_allocated: discountAllocated,
        coupon_codes: couponCodes,
        order_total: parseFloat(order.total || '0'),
        paid_at: paidAt,
        raw: { order_id: orderId, event_id: eventId } // Debug info
      });
      
      console.log(`[WooSync] ✓ Order ${orderId} → Event ${eventId}: ${totalQuantity} tickets, ${total} ${order.currency || 'RON'} paid`);
    }

    return results;
  }
};
