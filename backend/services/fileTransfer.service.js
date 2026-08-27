import { findVncSessionById } from "../repositories/vncSessions.repo.js";
import { streamDownloadToResponse } from "../ws/fileTransferRelay.js";
import { insertActivityLog } from "../repositories/activityLog.repo.js";
import { notFound } from "../utils/httpError.js";

// Hibridni put (vidi napomenu na vrhu ws/fileTransferRelay.js) - list/upload
// idu preko viewer-ovog WS-a direktno (čist passthrough u relay-u, ne
// zahtevaju ovaj servisni sloj), SAMO download prolazi kroz običnu
// Express rutu jer nam treba pravi HTTP response da bismo browseru dali
// obično "download" ponašanje (`<a href>`) umesto ručnog Blob sastavljanja.
export async function downloadFileFromAgentService(agentId, sessionId, filePath, user, res) {
  const session = await findVncSessionById(sessionId);
  if (!session || session.agentId !== agentId) {
    throw notFound("VNC sesija nije pronađena za ovog agenta.");
  }

  try {
    await streamDownloadToResponse(sessionId, filePath, res);
    await insertActivityLog({
      userId: user?.userId ?? null,
      username: user?.username ?? null,
      action: "file_transfer_download",
      ipAddress: null,
      statusCode: 200,
      details: JSON.stringify({ agentId, sessionId, path: filePath }),
    });
  } catch (err) {
    await insertActivityLog({
      userId: user?.userId ?? null,
      username: user?.username ?? null,
      action: "file_transfer_download_failed",
      ipAddress: null,
      statusCode: null,
      details: JSON.stringify({ agentId, sessionId, path: filePath, error: err.message }),
    }).catch(() => {});

    if (!res.headersSent) {
      res.status(502).json({ message: err.message || "Preuzimanje fajla neuspešno." });
    } else {
      try {
        res.end();
      } catch {
        /* best effort */
      }
    }
  }
}
