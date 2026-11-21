-- Information-security act: unsolicited screen capture is banned. Before the
-- agent even starts the VNC bridge, the user at the workstation must actively
-- approve the session, and the whole event must leave an indelible audit trail
-- (IT worker's username, approver's username, start/end time, IP and MAC of
-- both workstations). The working/mutable part of the state lives here on the
-- vnc_sessions row; the permanent indelible trail goes to activity_log (append-only).

-- consent_status: the flow is pending -> (granted | denied | timeout | unavailable).
--   granted      = the user clicked "Yes" in the consent dialog
--   denied       = the user clicked "No"
--   timeout      = the dialog expired without an answer
--   unavailable  = no active console (signed-in) session to show it to
-- Every non-granted outcome leaves the session unusable (status='rejected').
ALTER TABLE vnc_sessions
  ADD COLUMN consent_status ENUM('pending', 'granted', 'denied', 'timeout', 'unavailable')
    NOT NULL DEFAULT 'pending' AFTER status,
  ADD COLUMN approver_username VARCHAR(255) NULL AFTER consent_status,
  ADD COLUMN consent_at TIMESTAMP NULL DEFAULT NULL AFTER approver_username,
  ADD COLUMN agent_ip VARCHAR(45) NULL AFTER consent_at,
  ADD COLUMN agent_mac VARCHAR(255) NULL AFTER agent_ip,
  ADD COLUMN viewer_ip VARCHAR(45) NULL AFTER agent_mac,
  ADD COLUMN viewer_mac VARCHAR(255) NULL AFTER viewer_ip;

-- 'rejected' is a new terminal status for a session whose consent was denied/
-- timed out/unavailable - distinct from 'ended' (a normally finished session) so
-- reports can separate rejected attempts from sessions that actually took place.
-- Existing values ('pending','active','ended') are unchanged.
ALTER TABLE vnc_sessions
  MODIFY COLUMN status ENUM('pending', 'active', 'ended', 'rejected')
    NOT NULL DEFAULT 'pending';
