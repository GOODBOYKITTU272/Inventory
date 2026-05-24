-- =====================================================================
-- Migration 0011: Fix v_request_queue + AI Reminder Cron
-- Run AFTER enabling pg_cron and pg_net extensions in Supabase
-- =====================================================================

-- 1. Add rating and feedback columns directly to requests if they do not exist
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS rating INT;
ALTER TABLE public.requests ADD COLUMN IF NOT EXISTS feedback TEXT;

-- 2. Fix v_request_queue — expose all columns the frontend uses (static columns representation)
CREATE OR REPLACE VIEW public.v_request_queue AS
SELECT
  r.id, r.raw_text, r.category, r.parsed_item,
  r.parsed_employee_name, r.parsed_location, r.instruction,
  r.status, r.live_status, r.submitted_by, r.assigned_to,
  r.fulfilled_by, r.created_at, r.updated_at, r.fulfilled_at,
  r.notes, r.priority, r.rating, r.feedback, r.rating_status,
  r.accepted_at, r.started_at, r.on_the_way_at, r.cancelled_at,
  p.full_name AS submitter_name
FROM requests r
LEFT JOIN profiles p ON p.id = r.submitted_by;

-- 3. Schedule AI reminders (requires pg_cron + pg_net enabled in dashboard)
-- In production, replace the localhost URL with your actual deployed Render backend URL
SELECT cron.schedule(
  'ai-reminders-every-30min',
  '*/30 9-18 * * 1-5',   -- every 30 minutes, 9:00 AM to 6:59 PM, Monday to Friday
  $$
    SELECT net.http_post(
      url := 'http://localhost:4000/api/cron/ai-reminders',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"secret":"app_wizz_cron_secret_change_in_production"}'::jsonb
    )
  $$
);
