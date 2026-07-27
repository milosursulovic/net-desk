import { toInt, clamp } from "../utils/numbers.js";
import { parseBool } from "../utils/queryCoercion.js";
import { sendTablePdf } from "../utils/pdfTable.js";
import {
  listMetadataPage,
  statsService,
  searchMetadataService,
  listEntriesWithoutMetadataService,
} from "../services/metadata.service.js";

export async function listMetadataController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 1000);

  const out = await listMetadataPage({ page, limit });
  res.json(out);
}

export async function searchMetadataController(req, res) {
  const term = String(req.query.q || "");
  const out = await searchMetadataService(term);
  res.json(out);
}

export async function statsController(req, res) {
  const includeMeta = parseBool(req.query.includeMeta);
  const out = await statsService(includeMeta);
  res.json(out);
}

export async function listWithoutMetadataController(req, res) {
  const out = await listEntriesWithoutMetadataService();
  res.json(out);
}

export async function exportWithoutMetadataPdfController(req, res) {
  const { items } = await listEntriesWithoutMetadataService();
  const dateStamp = new Date().toISOString().slice(0, 10);

  sendTablePdf(res, {
    title: "NetDesk — Računari bez metapodataka",
    subtitle: `Ukupno: ${items.length} — generisano ${dateStamp}`,
    filename: `NetDesk_bez_metapodataka_${dateStamp}.pdf`,
    columns: [
      { header: "Računar", key: "computerName", width: 180 },
      { header: "IP", key: "ip", width: 110 },
      { header: "Odeljenje", key: "department", width: 160 },
      { header: "OS", key: "os", width: 220 },
    ],
    rows: items,
    emptyText: "Svi računari imaju prikupljene metapodatke.",
  });
}
