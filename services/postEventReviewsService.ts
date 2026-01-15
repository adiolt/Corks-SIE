import { supabase } from "./supabaseClient";
import { db } from "./storage";
import { PostEventReview, RatingMetrics } from "../types";

const isSupabaseConfigured = () => !!supabase;

export const postEventReviewsService = {

  /**
   * Get review for an event.
   */
  async getByEvent(eventId: number): Promise<PostEventReview | null> {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('post_event_reviews')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();

      if (error) {
        console.warn("Supabase review fetch warning:", error.message);
      }

      if (data) {
        // Map snake_case DB fields to CamelCase TS interface
        const review: PostEventReview = {
          id: data.id,
          eventId: data.event_id,
          ratings: data.ratings as RatingMetrics,
          tags: data.tags || [],
          recap: data.recap,
          notes: data.notes,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
        db.cachePostEventReview(review);
        return review;
      }
    }
    return db.getPostEventReview(eventId);
  },

  /**
   * Upsert a review.
   */
  async upsertByEvent(eventId: number, payload: { ratings: RatingMetrics; tags: string[]; recap: string; notes?: string }): Promise<PostEventReview> {
    if (isSupabaseConfigured()) {
      // Prepare payload for DB (snake_case columns where necessary)
      const dbPayload = {
        event_id: eventId,
        ratings: payload.ratings,
        tags: payload.tags,
        recap: payload.recap,
        notes: payload.notes,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('post_event_reviews')
        .upsert(dbPayload, { onConflict: 'event_id' })
        .select()
        .single();

      if (!error && data) {
        const review: PostEventReview = {
          id: data.id,
          eventId: data.event_id,
          ratings: data.ratings as RatingMetrics,
          tags: data.tags || [],
          recap: data.recap,
          notes: data.notes,
          createdAt: data.created_at,
          updatedAt: data.updated_at
        };
        db.cachePostEventReview(review);
        return review;
      }
      console.error("Supabase review upsert error:", error);
    }

    // Fallback
    return db.savePostEventReview({
      eventId,
      ...payload
    });
  }
};