import { isValidIPv4 } from "../utils/ip.js";
import {
  getMetadataByIp,
  upsertMetadataByIp,
  patchMetadataByIp,
} from "../services/metadata.service.js";
import { findIpEntryByIdLean } from "../repositories/ipEntries.repo.js";
import { badRequest, notFound } from "../utils/httpError.js";

function requireValidIp(ip) {
  if (!isValidIPv4(ip)) throw badRequest("Neispravan IP");
}

export async function upsertMetadataByIpController(req, res) {
  const ip = req.params.ip;
  requireValidIp(ip);

  const meta = await upsertMetadataByIp(ip, req.body || {});
  res.json(meta);
}

export async function getMetadataByIpController(req, res) {
  const ip = req.params.ip;
  requireValidIp(ip);

  const { ipEntryId, metadata } = await getMetadataByIp(ip);

  const ipEntry = await findIpEntryByIdLean(ipEntryId);
  if (!ipEntry) throw notFound("Not found");
  if (!metadata) throw notFound("Metadata not found");

  res.json({ ...ipEntry, metadata });
}

export async function patchMetadataByIpController(req, res) {
  const ip = req.params.ip;
  requireValidIp(ip);

  const meta = await patchMetadataByIp(ip, req.body || {});
  res.json(meta);
}
