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

// Korisnik na radnoj stanici odobrio preuzimanje - zabelezi ko (approver) i
// kada (consent_at), plus IP/MAC agentove radne stanice (jedina strana koja
// pouzdano zna svoj MAC). Samo iz 'pending' - stiti od dvostruke/zakasnele
// prijave pristanka na vec razresenoj sesiji.
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

// Pristanak nije dat (odbijen / istekao / nema aktivne sesije) - sesija
// postaje neupotrebljiva. consent_status nosi tacan razlog za audit.
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

// IP/MAC IKT (viewer) radne stanice - MAC se ne moze dobiti iz browsera, pa
// ga pozivalac razresava preko ip_entries (moze biti null ako stanica nije
// upravljana). Postavlja se kad se viewer WebSocket zakaci na relay.
export async function setVncSessionViewerInfo(id, { viewerIp, viewerMac }) {
  const [result] = await pool.execute(
    `UPDATE vnc_sessions SET viewer_ip = ?, viewer_mac = ? WHERE id = ?`,
    [viewerIp ?? null, viewerMac ?? null, id],
  );
  return result.affectedRows;
}

export async function markVncSessionActive(id) {
  const [result] = await pool.execute(
    // Aktivira se samo ako je pristanak dat - odbrana u dubinu uz proveru u
    // ws/vncRelay.js (agent most se ne sme uspostaviti bez 'granted').
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
