import {
  getLatestReportService,
  getReportByIdService,
  listReportsService,
  markReportReadService,
} from "../services/dailyReport.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { toInt, clamp } from "../utils/numbers.js";
import { sendReportPdf } from "../utils/reportPdf.js";
import { SITES } from "../dtos/ipAddresses.dto.js";

function siteFilter(value) {
  return SITES.includes(value) ? value : undefined;
}

export async function listReportsController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 20), 1, 100);

  const out = await listReportsService({ page, limit, site: siteFilter(req.query.site) });
  res.json(out);
}

export async function getLatestReportController(req, res) {
  const out = await getLatestReportService(siteFilter(req.query.site));
  res.json(out);
}

export async function getReportByIdController(req, res) {
  const id = parseIdParam(req, "id", "ID izveštaja");
  const out = await getReportByIdService(id);
  res.json(out);
}

export async function getReportPdfController(req, res) {
  const id = parseIdParam(req, "id", "ID izveštaja");
  const report = await getReportByIdService(id);
  sendReportPdf(res, report);
}

export async function markReportReadController(req, res) {
  const id = parseIdParam(req, "id", "ID izveštaja");
  const out = await markReportReadService(id);
  res.json(out);
}
