-- Live monitoring (WS-D) — email layer (increment 6). ADDITIVE to 20260617000000_live_monitoring_watches.
--
-- NOT YET APPLIED — applying is owner-gated, and EMAIL SENDING ITSELF stays dormant until the owner
-- configures Resend (verified domain + RESEND_API_KEY + RESEND_FROM). This migration only adds the
-- bookkeeping the dormant watch-digest function needs: a per-event "already emailed" stamp and a
-- per-user opt-out list. Both are additive and touch no existing data.

-- At-least-once delivery: the digest sweep stamps digested_at AFTER a confirmed send and only picks
-- alerts where digested_at IS NULL, so a missed/crashed sweep re-sends rather than silently dropping an
-- alert. A crash in the narrow window between the send and the stamp can re-send on recovery (we choose
-- a possible duplicate over a dropped safety alert) — exactly-once is not claimed.
ALTER TABLE watch_events ADD COLUMN IF NOT EXISTS digested_at timestamptz;

-- Undigested loud alerts, newest-first — the exact set the digest sweep scans per user.
CREATE INDEX IF NOT EXISTS watch_events_undigested_alert_idx
  ON watch_events (user_id, detected_at DESC)
  WHERE is_alert AND digested_at IS NULL;

-- One row per user who unsubscribed from digest emails (CAN-SPAM). The digest sweep excludes them.
-- Written by the token-verified public unsubscribe handler (service role) and readable by the owner so
-- the app can show "you're unsubscribed". No INSERT policy for end users: the only legit insert path is
-- the signed-link handler running as service role.
CREATE TABLE IF NOT EXISTS watch_email_optout (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  opted_out_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE watch_email_optout ENABLE ROW LEVEL SECURITY;
CREATE POLICY weo_owner_read ON watch_email_optout FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
-- owner DELETE = re-subscribe from the app (same direct-RLS-write pattern as marking events read).
CREATE POLICY weo_owner_delete ON watch_email_optout FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
