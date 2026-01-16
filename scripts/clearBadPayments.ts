/**
 * Clear bad payment records from Supabase
 * Run this once before re-syncing with the new order→event mapping logic
 */

import { supabase } from '../services/supabaseClient';

async function clearBadPayments() {
  console.log('Clearing all payment records from wp_ticket_payments...');
  
  const { error } = await supabase
    .from('wp_ticket_payments')
    .delete()
    .neq('wp_order_id', ''); // Delete all records (neq with empty string matches all)

  if (error) {
    console.error('Error clearing payments:', error);
  } else {
    console.log('✓ All payment records cleared successfully');
    console.log('You can now re-sync to get correct data');
  }
}

clearBadPayments();
