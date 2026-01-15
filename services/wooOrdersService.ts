
import { paymentsService } from "./paymentsService";

// Helper to chunk array
const chunkArray = (arr: any[], size: number) => {
  return Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );
};

export const wooOrdersService = {

  /**
   * Orchestrates the fetching and processing of orders via Edge Function.
   * 1. Filters out existing orders (client-side check).
   * 2. Calls Edge Function for missing ones.
   */
  async syncPaymentsForOrders(wpEventId: string | number, orderIds: (string | number)[]): Promise<void> {
    if (orderIds.length === 0) return;

    const eventIdStr = String(wpEventId);

    // 1. Deduplicate and Stringify
    const uniqueIds = Array.from(new Set(orderIds.map(String)));
    
    console.log(`[WooSync] Analyzing ${uniqueIds.length} candidate orders for event ${eventIdStr}...`);

    // 2. Check which ones we already have in Supabase
    const existingSet = await paymentsService.getExistingOrderIds(uniqueIds);
    
    // 3. Filter missing
    const missingIds = uniqueIds.filter(id => !existingSet.has(id));

    if (missingIds.length === 0) {
        console.log("[WooSync] All orders already synced. Skipping.");
        return;
    }

    console.log(`[WooSync] Syncing ${missingIds.length} missing orders via Edge Function...`);

    // 4. Call Edge Function in chunks (to avoid payload limits)
    const CHUNK_SIZE = 20;
    const chunks = chunkArray(missingIds, CHUNK_SIZE);

    for (const chunk of chunks) {
      const result = await paymentsService.syncPaymentsViaEdge(eventIdStr, chunk);
      if (!result.success) {
          console.error(`[WooSync] Chunk failed:`, result.error);
      } else {
          console.log(`[WooSync] Chunk success:`, result.data);
      }
    }
  }
};
