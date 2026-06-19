-- ─────────────────────────────────────────────────────────────────────────────
-- 0024 · DigiSME HRMS Integration
-- Adds employee_code + HR fields to profiles.
-- Creates digisme_sync_logs to track every daily sync run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Profiles: add DigiSME HR fields ──────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_code     TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS department_name   TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS designation_name  TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS digisme_synced_at TIMESTAMPTZ DEFAULT NULL;

-- employee_code must be unique when set
CREATE UNIQUE INDEX IF NOT EXISTS profiles_employee_code_idx
  ON public.profiles (employee_code)
  WHERE employee_code IS NOT NULL;

-- ── Sync audit log ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.digisme_sync_logs (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at         TIMESTAMPTZ NOT NULL    DEFAULT now(),
  triggered_by      TEXT        NOT NULL    DEFAULT 'cron',  -- 'cron' | 'manual'
  status            TEXT        NOT NULL    DEFAULT 'success', -- 'success' | 'failed'
  total_fetched     INTEGER     NOT NULL    DEFAULT 0,
  added_count       INTEGER     NOT NULL    DEFAULT 0,
  updated_count     INTEGER     NOT NULL    DEFAULT 0,
  deactivated_count INTEGER     NOT NULL    DEFAULT 0,
  error_message     TEXT        DEFAULT NULL
);

ALTER TABLE public.digisme_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_logs_read"
  ON public.digisme_sync_logs FOR SELECT
  USING (public.current_user_role() IN ('leadership', 'facility_manager'));
