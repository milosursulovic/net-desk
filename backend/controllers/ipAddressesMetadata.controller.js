import { isValidIPv4 } from "../utils/ip.js";
import { getMetadataByIp, upsertMetadataByIp, patchMetadataByIp } from "../services/metadata.service.js";
import { findIpEntryByIdLean } from "../repositories/ipEntries.repo.js";

export async function upsertMetadataByIpController(req, res) {
    const ip = req.params.ip;
    if (!isValidIPv4(ip)) return res.status(400).json({ message: "Neispravan IP" });

    const meta = await upsertMetadataByIp(ip, req.body || {});
    res.json(meta);
}

export async function getMetadataByIpController(req, res) {
    const ip = req.params.ip;
    if (!isValidIPv4(ip)) return res.status(400).json({ message: "Neispravan IP" });

    const { ipEntryId, metadata } = await getMetadataByIp(ip);

    const ipEntry = await findIpEntryByIdLean(ipEntryId);
    if (!ipEntry) return res.status(404).json({ error: "Not found" });
    if (!metadata) return res.status(404).json({ error: "Metadata not found" });

    res.json({ ...ipEntry, metadata });
}

export async function patchMetadataByIpController(req, res) {
    const ip = req.params.ip;
    if (!isValidIPv4(ip)) return res.status(400).json({ message: "Neispravan IP" });

    const meta = await patchMetadataByIp(ip, req.body || {});
    res.json(meta);
}
