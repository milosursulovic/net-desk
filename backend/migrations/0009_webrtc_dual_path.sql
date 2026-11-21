-- Phase 1 dual-path VNC (RFB + WebRTC) plumbing - see the plan in
-- /home/misa/.claude/plans/temporal-tickling-anchor.md. No column here
-- changes existing behavior (all defaults preserve today's RFB-only flow).

-- The agent reports its own build tier (a compile-time constant, not a runtime
-- probe) on enroll/heartbeat - the deployment group is just a static admin
-- label, not a reliable signal of whether the agent ACTUALLY contains WebRTC code
-- (it can be in the win10 group while still on the old net452 build until the
-- rollout finishes).
ALTER TABLE agents
  ADD COLUMN remote_control_tier ENUM('rfb_only', 'webrtc_capable') NOT NULL DEFAULT 'rfb_only';

-- Two agent builds (net452 RFB-only, net472 RFB+WebRTC) may share the same
-- version string - findReleaseIdByVersion already documented accepting that
-- ambiguity ("most recently uploaded wins") when it was harmless (a single
-- tier). It no longer is - filtering by tier as well resolves it.
ALTER TABLE agent_releases
  ADD COLUMN target_runtime ENUM('net452', 'net472') NOT NULL DEFAULT 'net452';

-- rfb stays the default - existing sessions/rows are unchanged.
ALTER TABLE vnc_sessions
  ADD COLUMN session_type ENUM('rfb', 'webrtc') NOT NULL DEFAULT 'rfb';

-- Append-only signaling log (SDP offer/answer + ICE candidates), not mutable
-- columns - same pattern as flagged_*_exceptions (0008): a separate table per
-- concept instead of a polymorphic column. Rows here are deleted when the
-- vnc_sessions row is deleted (ON DELETE CASCADE); signaling is meaningless
-- without the session it belongs to.
CREATE TABLE vnc_webrtc_signaling (
  id INT NOT NULL AUTO_INCREMENT,
  session_id INT NOT NULL,
  direction ENUM('agent_to_viewer', 'viewer_to_agent') NOT NULL,
  payload TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_vnc_webrtc_signaling_session (session_id),
  CONSTRAINT fk_vnc_webrtc_signaling_session FOREIGN KEY (session_id) REFERENCES vnc_sessions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
