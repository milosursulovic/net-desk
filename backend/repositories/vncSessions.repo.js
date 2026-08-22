import { pool } from "../db/pool.js";

export async function insertVncSession({ agentId, requestedByUserId, sessionType }) {
  const [result] = await pool.execute(
    `
    INSERT INTO vnc_sessions (agent_id, requested_by_user_id, status, session_type)
    VALUES (?, ?, 'pending', ?)
    `,
    [agentId, requestedByUserId, sessionType || "rfb"],
  );
  return result.insertId;
}

const SELECT_FIELDS = `
  id,
  agent_id AS agentId,
  requested_by_user_id AS requestedByUserId,
  status,
  session_type AS sessionType,
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

export async function markVncSessionActive(id) {
  const [result] = await pool.execute(
    `UPDATE vnc_sessions SET status = 'active' WHERE id = ? AND status = 'pending'`,
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

// Fallback sa WebRTC na RFB ZA ISTI sessionId (ne nova sesija) - status se
// namerno vraća na 'pending' (ne dira se ako je već 'ended') jer novi
// start_vnc_bridge job tek treba da poveže agenta, isto stanje kao svaki
// nov RFB pokušaj pre nego što VncBridge.RunAsync stigne da markVncSessionActive.
export async function markVncSessionFallbackToRfb(id) {
  const [result] = await pool.execute(
    `UPDATE vnc_sessions SET session_type = 'rfb', status = 'pending' WHERE id = ? AND status != 'ended'`,
    [id],
  );
  return result.affectedRows;
}

// Append-only audit log signaling razmene (SDP offer/answer + ICE
// kandidati) - vidi migraciju 0009. Ne učestvuje u samom real-time
// forwarding-u (to radi ws/webrtcSignaling.js direktno preko in-memory
// socket para, isti obrazac kao ws/vncRelay.js), samo beleži šta se
// razmenilo za kasniju dijagnostiku.
export async function insertWebrtcSignalingMessage(sessionId, direction, payload) {
  await pool.execute(
    `INSERT INTO vnc_webrtc_signaling (session_id, direction, payload) VALUES (?, ?, ?)`,
    [sessionId, direction, payload],
  );
}

// Čitanje ovog audit loga - dodato uživo kao dijagnostički alat (WebRtcBridge.exe
// šalje sopstvene {"type":"log"} poruke preko ovog istog signaling kanala kad
// lokalni FileLogger na klijentskoj mašini ispadne nepouzdan, videti Program.cs
// napomenu na Log()). Redosled po created_at ASC - hronološki tok razmene.
export async function listWebrtcSignalingMessages(sessionId) {
  const [rows] = await pool.execute(
    `
    SELECT direction, payload, created_at AS createdAt
    FROM vnc_webrtc_signaling
    WHERE session_id = ?
    ORDER BY created_at ASC, id ASC
    `,
    [sessionId],
  );
  return rows;
}
