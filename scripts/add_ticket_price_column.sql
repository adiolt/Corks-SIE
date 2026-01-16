-- Add ticketPrice column to manual_attendees table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/vffdzxemhbdplxlsoehx/editor

ALTER TABLE manual_attendees 
ADD COLUMN IF NOT EXISTS ticket_price DECIMAL(10,2);

-- Add comment for documentation
COMMENT ON COLUMN manual_attendees.ticket_price IS 'Price per ticket in RON. If null, uses event list price for revenue calculation.';
