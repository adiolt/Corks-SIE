
declare const Deno: any;

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: any) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    let body;
    try {
      body = await req.json();
    } catch (e) {
      throw new Error('Invalid JSON body');
    }

    const { wp_event_id, orders } = body;

    if (!wp_event_id || !orders || !Array.isArray(orders)) {
      throw new Error('Missing wp_event_id or orders array')
    }

    const WP_BASE_URL = Deno.env.get('WP_BASE_URL')
    const WC_CK = Deno.env.get('WC_CONSUMER_KEY')
    const WC_CS = Deno.env.get('WC_CONSUMER_SECRET')

    if (!WP_BASE_URL || !WC_CK || !WC_CS) {
      throw new Error('Server misconfiguration: Missing Woo Credentials (WP_BASE_URL, WC_CONSUMER_KEY, WC_CONSUMER_SECRET)')
    }

    let processedCount = 0
    let upsertedCount = 0
    const errors: any[] = []
    const skipped: string[] = []
    const paymentsPayload: any[] = []

    // Process orders in parallel (batches of 5 to avoid rate limits)
    const BATCH_SIZE = 5
    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE)
      
      await Promise.all(batch.map(async (orderReq: any) => {
        const orderId = orderReq.wp_order_id
        if (!orderId) return

        try {
          const url = `${WP_BASE_URL}/wp-json/wc/v3/orders/${orderId}?consumer_key=${WC_CK}&consumer_secret=${WC_CS}`
          const response = await fetch(url)

          if (!response.ok) {
            errors.push({ orderId, status: response.status, msg: 'Woo fetch failed' })
            return
          }

          const order = await response.json()
          processedCount++

          // Process Line Items
          if (order.line_items && Array.isArray(order.line_items)) {
            const couponCodes = order.coupon_lines && Array.isArray(order.coupon_lines)
              ? order.coupon_lines.map((c: any) => c.code).join(',')
              : ''

            const paidAt = order.date_paid || order.date_paid_gmt || order.date_created

            for (const item of order.line_items) {
              const qty = parseInt(item.quantity) || 1
              const lineTotalPaid = parseFloat(item.total) || 0 // Post-discount
              const lineSubtotal = parseFloat(item.subtotal) || 0 // Pre-discount
              
              // Derived values
              const unitPricePaid = qty > 0 ? lineTotalPaid / qty : 0
              const discountAllocated = lineSubtotal - lineTotalPaid

              paymentsPayload.push({
                wp_event_id: String(wp_event_id),
                wp_order_id: String(order.id),
                wp_order_item_id: String(item.id),
                qty: qty,
                currency: order.currency || 'RON',
                line_total_paid: lineTotalPaid,
                unit_price_paid: unitPricePaid,
                line_subtotal: lineSubtotal,
                discount_allocated: discountAllocated,
                coupon_codes: couponCodes,
                order_total: parseFloat(order.total) || 0,
                paid_at: paidAt,
                // Store raw minimal debug info
                raw: { 
                  sku: item.sku, 
                  name: item.name, 
                  status: order.status 
                }
              })
            }
          }
        } catch (err: any) {
          errors.push({ orderId, msg: err.message })
        }
      }))
    }

    // Bulk Upsert to Supabase
    if (paymentsPayload.length > 0) {
      const { error: upsertError } = await supabaseClient
        .from('wp_ticket_payments')
        .upsert(paymentsPayload, { onConflict: 'wp_order_id, wp_order_item_id' })

      if (upsertError) {
        throw new Error(`Supabase Upsert Error: ${upsertError.message}`)
      }
      upsertedCount = paymentsPayload.length
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed_orders: processedCount,
        upserted_lines: upsertedCount,
        errors: errors,
        skipped_orders: skipped
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
