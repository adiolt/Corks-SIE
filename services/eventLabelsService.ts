import { supabase } from "./supabaseClient";
import { EventLabelsRow } from "../types";
import { generateEventLabels } from "./aiLabels";

const isSupabaseConfigured = () => !!supabase;

export const eventLabelsService = {
  
  /**
   * Get labels for a single event.
   */
  async getByEvent(eventId: number): Promise<EventLabelsRow | null> {
    if (!isSupabaseConfigured()) return null;

    const { data, error } = await supabase
      .from('event_labels')
      .select('*')
      .eq('event_id', eventId)
      .maybeSingle();

    if (error) {
      console.warn(`Error fetching labels for ${eventId}:`, error.message);
      return null;
    }
    return data as EventLabelsRow;
  },

  /**
   * Batch fetch labels for multiple events (Dashboard optimization).
   */
  async getBatch(eventIds: number[]): Promise<EventLabelsRow[]> {
    if (!isSupabaseConfigured() || eventIds.length === 0) return [];

    const { data, error } = await supabase
      .from('event_labels')
      .select('*')
      .in('event_id', eventIds);

    if (error) {
      console.warn("Error batch fetching labels:", error.message);
      return [];
    }
    return data as EventLabelsRow[];
  },

  /**
   * Upsert labels.
   */
  async upsertByEvent(eventId: number, payload: Partial<EventLabelsRow>): Promise<EventLabelsRow | null> {
    if (!isSupabaseConfigured()) return null;

    const dbPayload = {
      event_id: eventId,
      drinks_label: payload.drinks_label,
      theme_label: payload.theme_label,
      confidence: payload.confidence,
      reasoning: payload.reasoning,
      source: payload.source || 'ai_v1',
      model: payload.model || 'gemini-2.5-flash',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('event_labels')
      .upsert(dbPayload, { onConflict: 'event_id' })
      .select()
      .single();

    if (error) {
      console.error(`Error upserting labels for ${eventId}:`, error.message);
      return null;
    }
    return data as EventLabelsRow;
  },

  /**
   * Main Orchestrator:
   * 1. Check DB.
   * 2. If missing OR force=true, Generate via AI.
   * 3. Save to DB.
   * 4. Return result.
   */
  async ensureForEvent(
    input: { wp_event_id: number; title: string; description: string; wineList?: string[] }, 
    force: boolean = false
  ): Promise<EventLabelsRow | null> {
    
    // 1. Check existing (skip if forcing)
    if (!force) {
        const existing = await this.getByEvent(input.wp_event_id);
        if (existing) return existing;
    }

    // 2. Generate
    console.log(`[Labels] Generating for ${input.wp_event_id} (Force: ${force})...`);
    const generated = await generateEventLabels({
      eventId: input.wp_event_id,
      title: input.title,
      description: input.description,
      wineList: input.wineList
    });

    // 3. Save
    return this.upsertByEvent(input.wp_event_id, {
      drinks_label: generated.drinks_label,
      theme_label: generated.theme_label,
      confidence: generated.confidence,
      reasoning: generated.reasoning,
      source: force ? 'ai_manual_refresh' : 'ai_auto_gen',
    });
  }
};