import { ActivityLogQuerySchema, ActivityLogExportSchema } from "../dtos/activityLog.dto.js";
import { listActivityLogService, exportActivityLogService } from "../services/activityLog.service.js";
import { sendXlsxExport } from "../utils/exportExcel.js";
import { badRequest } from "../utils/httpError.js";

export async function listActivityLogController(req, res) {
  const parsed = ActivityLogQuerySchema.safeParse(req.query);
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await listActivityLogService(parsed.data);
  res.json(out);
}

export async function exportActivityLogController(req, res) {
  const parsed = ActivityLogExportSchema.safeParse(req.query);
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const rows = await exportActivityLogService(parsed.data);

  const filename = `activity-log_${new Date().toISOString().slice(0, 10)}.xlsx`;
  await sendXlsxExport(res, {
    filename,
    sheets: [
      {
        name: "Logovi",
        columns: [
          { header: "Vreme", key: "createdAt", width: 22 },
          { header: "Korisnik", key: "username", width: 20 },
          { header: "Akcija", key: "action", width: 36 },
          { header: "Detalji", key: "details", width: 80 },
          { header: "IP", key: "ipAddress", width: 18 },
          { header: "Status", key: "statusCode", width: 10 },
        ],
        rows: rows.map((r) => ({
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 19) : "",
          username: r.username ?? "",
          action: r.action ?? "",
          details: r.details ?? "",
          ipAddress: r.ipAddress ?? "",
          statusCode: r.statusCode ?? "",
        })),
      },
    ],
  });
}
