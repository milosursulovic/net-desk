-- Rollout bypass of the VNC consent gate (the 'vnc_consent_bypass_legacy' setting
-- on the Config page). Agents older than 1.7.0 don't know about consent at all -
-- they never show the dialog nor report an outcome, so their sessions would sit in
-- 'pending' forever. While the setting is on, such sessions are marked
-- 'bypassed' instead: a distinct value (not 'granted') so the audit trail never
-- claims a user approved a session they were never asked about.
ALTER TABLE vnc_sessions
  MODIFY COLUMN consent_status
    ENUM('pending', 'granted', 'denied', 'timeout', 'unavailable', 'bypassed')
    NOT NULL DEFAULT 'pending';
