import XLSX from "xlsx";
import { ScanSchema, ListSchema, UpsertIpSchema } from "../dtos/ipAddresses.dto.js";
import { scanPorts, listService, getByIdService, createService, updateService, deleteService, duplicatesService, exportXlsxRowsService } from "../services/ipAddresses.service.js";
import { toInt } from "../utils/numbers.js";

export async function scanPortsController(req, res) {
    const q = ScanSchema.safeParse(req.query);
    if (!q.success) return res.status(400).json({ error: q.error.issues });

    const out = await scanPorts(q.data);
    res.json(out);
}

export async function duplicatesController(req, res) {
    const parsed = ListSchema.parse(req.query);
    const out = await duplicatesService({ search: parsed.search, status: parsed.status });
    res.json(out);
}

export async function exportXlsxController(req, res) {
    const search = String(req.query.search || "");
    const rows = await exportXlsxRowsService(search);

    const ws = XLSX.utils.json_to_sheet(rows, {
        header: [
            "ip",
            "computerName",
            "username",
            "fullName",
            "rdp",
            "rdpApp",
            "os",
            "department",
            "hasMetadata",
            "heliantInstalled",
        ],
        skipHeader: false,
    });

    ws["!cols"] = [
        { wch: 14 },
        { wch: 12 },
        { wch: 18 },
        { wch: 22 },
        { wch: 16 },
        { wch: 20 },
        { wch: 14 },
        { wch: 14 },
        { wch: 16 },
        { wch: 16 },
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "IP-Entries");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    res.setHeader("Content-Disposition", 'attachment; filename="ip-entries.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
}

export async function listController(req, res) {
    const parsed = ListSchema.parse(req.query);
    const out = await listService(parsed);
    res.json(out);
}

export async function getByIdController(req, res) {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "Neispravan ID" });

    const out = await getByIdService(id);
    res.json(out);
}

export async function createController(req, res) {
    const parsed = UpsertIpSchema.parse(req.body);
    const created = await createService(parsed);
    res.status(201).json(created);
}

export async function updateController(req, res) {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "Neispravan ID" });

    const parsed = UpsertIpSchema.partial().parse(req.body);
    const updated = await updateService(id, parsed);
    res.json(updated);
}

export async function deleteController(req, res) {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ message: "Neispravan ID" });

    await deleteService(id);
    res.json({ message: "Unos obrisan" });
}
