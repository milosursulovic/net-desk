-- Faza 1 dual-path VNC (RFB + WebRTC) plumbing - vidi plan u
-- /home/misa/.claude/plans/temporal-tickling-anchor.md. Nijedna kolona ovde
-- ne menja postojece ponasanje (svi default-i cuvaju danasnji RFB-only tok).

-- Agent prijavljuje sopstveni build-tier (compile-time konstanta, ne runtime
-- probe) na enroll/heartbeat - deployment grupa je samo staticka admin
-- oznaka, ne pouzdan signal da li agent STVARNO ima WebRTC kod u sebi
-- (moze biti u win10 grupi a jos uvek na starom net452 build-u dok se
-- rollout ne zavrsi).
ALTER TABLE agents
  ADD COLUMN remote_control_tier ENUM('rfb_only', 'webrtc_capable') NOT NULL DEFAULT 'rfb_only';

-- Dve verzije agenta (net452 RFB-only, net472 RFB+WebRTC) mogu deliti isti
-- version string - findReleaseIdByVersion je vec dokumentovano prihvatao tu
-- dvosmislenost ("najskorije otpremljeni pobedjuje") kad je to bilo bezopasno
-- (jedan tier). Sad vise nije - filtriranje i po tier-u resava to.
ALTER TABLE agent_releases
  ADD COLUMN target_runtime ENUM('net452', 'net472') NOT NULL DEFAULT 'net452';

-- rfb ostaje default - postojece sesije/redovi se ne menjaju.
ALTER TABLE vnc_sessions
  ADD COLUMN session_type ENUM('rfb', 'webrtc') NOT NULL DEFAULT 'rfb';

-- Append-only signaling log (SDP offer/answer + ICE kandidati), ne mutable
-- kolone - isti obrazac kao flagged_*_exceptions (0008): odvojena tabela po
-- konceptu umesto polimorfne kolone. Redovi ovde se brisu kad se
-- vnc_sessions red obrise (ON DELETE CASCADE), signaling nema smisla bez
-- sesije na koju se odnosi.
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
