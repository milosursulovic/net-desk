import ExcelJS from "exceljs";
import { toInt } from "../utils/numbers.js";
import { InventoryCreateSchema, InventoryUpdateSchema } from "../dtos/inventory.dto.js";
import { inventoryExportAll, inventoryFindById } from "../repositories/inventory.repo.js";
import { listInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem } from "../services/inventory.service.js";

export async function exportInventoryController(_req, res) {
    const items = await inventoryExportAll();

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventar");

    sheet.columns = [
        { header: "Tip", key: "type", width: 18 },
        { header: "Proizvođač", key: "manufacturer", width: 20 },
        { header: "Model", key: "model", width: 28 },
        { header: "Serijski broj", key: "serialNumber", width: 25 },
        { header: "Količina", key: "quantity", width: 10 },
        { header: "Status", key: "status", width: 14 },
        { header: "Kapacitet", key: "capacity", width: 12 },
        { header: "Brzina", key: "speed", width: 15 },
        { header: "Socket/Konektor", key: "socket", width: 18 },
        { header: "Lokacija", key: "location", width: 24 },
        { header: "Napomena", key: "notes", width: 40 },
        { header: "Kreirano", key: "createdAt", width: 20 },
        { header: "Ažurirano", key: "updatedAt", width: 20 },
    ];

    items.forEach((it) => {
        sheet.addRow({
            ...it,
            createdAt: it.createdAt ? new Date(it.createdAt).toLocaleString() : "",
            updatedAt: it.updatedAt ? new Date(it.updatedAt).toLocaleString() : "",
        });
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=inventar.xlsx");

    await workbook.xlsx.write(res);
    res.end();
}

export async function listInventoryController(req, res) {
  const result = await listInventory(req.query);
  res.json(result);
}


export async function getInventoryItemController(req, res) {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Neispravan ID." });

    const item = await inventoryFindById(id);
    if (!item) return res.status(404).json({ error: "Stavka nije pronađena." });

    res.json(item);
}

export async function createInventoryItemController(req, res) {
    const parsed = InventoryCreateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Neispravan format podataka" });

    const created = await createInventoryItem(parsed.data);
    res.status(201).json(created);
}

export async function updateInventoryItemController(req, res) {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Neispravan ID." });

    const parsed = InventoryUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Neispravan format podataka" });

    const updated = await updateInventoryItem(id, parsed.data);
    res.json(updated);
}

export async function deleteInventoryItemController(req, res) {
    const id = toInt(req.params.id);
    if (!id) return res.status(400).json({ error: "Neispravan ID." });

    await deleteInventoryItem(id);
    res.json({ success: true });
}
