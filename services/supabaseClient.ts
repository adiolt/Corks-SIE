import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.SUPABASE_ANON_KEY || '';

export const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY) ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true, // Allow session persistence if we add auth later
    autoRefreshToken: true,
  }
}) : null;

/**
 * Checks if Supabase connection is viable.
 * Simple ping to a public table or just checking configuration.
 */
export const checkSupabaseConnection = async () => {
    try {
        const { error } = await supabase.from('manual_attendees').select('count', { count: 'exact', head: true });
        if (error && error.code !== 'PGRST116') { // Ignore "Result contains 0 rows" or similar non-fatal errors
             console.warn("Supabase connection warning:", error.message);
             return false;
        }
        return true;
    } catch (e) {
        console.error("Supabase connection failed:", e);
        return false;
    }
};
