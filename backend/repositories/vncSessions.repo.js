import { pool } from "../db/pool.js";

export async function insertVncSession({ agentId, requestedByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO vnc_sessions (agent_id, requested_by_user_id, status, consent_status)
    VALUES (?, ?, 'pending', 'pending')
    `,
    [agentId, requestedByUserId],
  );
  return result.insertId;
}

const SELECT_FIELDS = `
  id,
  agent_id AS agentId,
  requested_by_user_id AS requestedByUserId,
  status,
  consent_status AS consentStatus,
  approver_username AS approverUsername,
  consent_at AS consentAt,
  agent_ip AS agentIp,
  agent_mac AS agentMac,
  viewer_ip AS viewerIp,
  viewer_mac AS viewerMac,
  started_at AS startedAt,
  ended_at AS endedAt
`;

export async function findVncSessionById(id) {
  const [rows] = await pool.execute(
    `SELECT ${SELECT_FIELDS} FROM vnc_sessions WHERE id = ? LIMIT 1`,
    [id],
  );
  return rows?.[0] || null;
}

// The user at the workstation approved the takeover - record who (approver) and
// when (consent_at), plus the IP/MAC of the agent's workstation (the only side that
// reliably knows its own MAC). Only from 'pending' - guards against a duplicate/late
// consent report on an already resolved session.
export async function markVncSessionConsentGranted(id, { approverUsername, agentIp, agentMac }) {
  const [result] = await pool.execute(
    `
    UPDATE vnc_sessions
    SET consent_status = 'granted',
        approver_username = ?,
        consent_at = NOW(),
        agent_ip = ?,
        agent_mac = ?
    WHERE id = ? AND consent_status = 'pending'
    `,
    [approverUsername ?? null, agentIp ?? null, agentMac ?? null, id],
  );
  return result.affectedRows;
}

// Consent was not given (denied / timed out / no active session) - the session
// becomes unusable. consent_status carries the exact reason for the audit.
export async function markVncSessionConsentDenied(
  id,
  consentStatus,
  { approverUsername, agentIp, agentMac },
) {
  const [result] = await pool.execute(
    `
    UPDATE vnc_sessions
    SET consent_status = ?,
        status = 'rejected',
        approver_username = ?,
        consent_at = NOW(),
        agent_ip = ?,
        agent_mac = ?
    WHERE id = ? AND consent_status = 'pending'
    `,
    [consentStatus, approverUsername ?? null, agentIp ?? null, agentMac ?? null, id],
  );
  return result.affectedRows;
}

// IP/MAC of the IT worker's (viewer) workstation - the MAC can't be obtained from the browser, so
// the caller resolves it through ip_entries (may be null if the workstation isn't
// managed). Set when the viewer WebSocket attaches to the relay.
export async function setVncSessionViewerInfo(id, { viewerIp, viewerMac }) {
  const [result] = await pool.execute(
    `UPDATE vnc_sessions SET viewer_ip = ?, viewer_mac = ? WHERE id = ?`,
    [viewerIp ?? null, viewerMac ?? null, id],
  );
  return result.affectedRows;
}

export async function markVncSessionActive(id) {
  const [result] = await pool.execute(
    // Activates only if consent was given - defense in depth alongside the check in
    // ws/vncRelay.js (the agent bridge must not be established without 'granted').
    `UPDATE vnc_sessions SET status = 'active', started_at = NOW()
     WHERE id = ? AND status = 'pending' AND consent_status = 'granted'`,
    [id],
  );
  return result.affectedRows;
}

export async function markVncSessionEnded(id) {
  const [result] = await pool.execute(
    `UPDATE vnc_sessions SET status = 'ended', ended_at = NOW() WHERE id = ? AND status != 'ended'`,
    [id],
  );
  return result.affectedRows;
}
