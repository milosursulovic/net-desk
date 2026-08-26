-- Reverts 0009_webrtc_dual_path.sql - WebRTC screen-share path removed
-- entirely (product decision: RFB/UltraVNC remains the only remote-control
-- transport). Drop order: the signaling table first (it has the FK), then
-- the columns added on agents/agent_releases/vnc_sessions.

DROP TABLE IF EXISTS vnc_webrtc_signaling;

ALTER TABLE vnc_sessions
  DROP COLUMN session_type;

ALTER TABLE agent_releases
  DROP COLUMN target_runtime;

ALTER TABLE agents
  DROP COLUMN remote_control_tier;
