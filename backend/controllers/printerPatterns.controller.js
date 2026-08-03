import { PrinterPatternSchema } from "../dtos/printerPatterns.dto.js";
import {
  listIgnoredPrinterPatternsService,
  addIgnoredPrinterPatternService,
  removeIgnoredPrinterPatternService,
} from "../services/printerPatterns.service.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";

export async function listIgnoredPrinterPatternsController(req, res) {
  const search = String(req.query.search || "").trim();
  const items = await listIgnoredPrinterPatternsService(search);
  res.json({ items });
}

export async function createIgnoredPrinterPatternController(req, res) {
  const parsed = PrinterPatternSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const created = await addIgnoredPrinterPatternService(parsed.data, req.user?.userId ?? null);
  res.status(201).json(created);
}

export async function deleteIgnoredPrinterPatternController(req, res) {
  const id = parseIdParam(req);
  await removeIgnoredPrinterPatternService(id);
  res.json({ success: true });
}
