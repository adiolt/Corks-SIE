import { createClient } from '@supabase/supabase-js';

// Credentials provided for the Corks Event CRM integration
const SUPABASE_URL = 'https://vffdzxemhbdplxlsoehx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UwRguMpC1ZYSbA4CEKfluQ_AWRnBG96';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true, // Allow session persistence if we add auth later
    autoRefreshToken: true,
  }
});

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
