import {
  getLatestReportService,
  getReportByIdService,
  listReportsService,
  generateDailyReport,
  markReportReadService,
} from "../services/dailyReport.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { toInt, clamp } from "../utils/numbers.js";

export async function listReportsController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 20), 1, 100);

  const out = await listReportsService({ page, limit });
  res.json(out);
}

export async function getLatestReportController(req, res) {
  const out = await getLatestReportService();
  res.json(out);
}

export async function getReportByIdController(req, res) {
  const id = parseIdParam(req, "id", "ID izveštaja");
  const out = await getReportByIdService(id);
  res.json(out);
}

// Ručno okidanje generisanja - koristi se za testiranje pre nego što se
// veže na dnevni scheduler, i kao rezervni izlaz ako scheduler ikad
// promaši ciklus (server je bio ugašen u 7h).
export async function generateReportController(req, res) {
  const out = await generateDailyReport();
  res.status(201).json(out);
}

export async function markReportReadController(req, res) {
  const id = parseIdParam(req, "id", "ID izveštaja");
  const out = await markReportReadService(id);
  res.json(out);
}
