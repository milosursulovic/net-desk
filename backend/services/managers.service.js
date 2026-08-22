import crypto from "crypto";
import { generateApiKey, hashApiKey } from "../utils/apiKey.js";
import { emptyToNull } from "../utils/strings.js";
import { ipToNumeric } from "../utils/ip.js";
import {
  insertManager,
  findManagerByUid,
  findManagerById,
  findManagerByIpEntryId,
  updateHeartbeat,
  linkManagerToIpEntry,
  revokeManagerById,
  deleteManagerById,
} from "../repositories/managers.repo.js";
import { findIpEntryIdByIp, insertIpEntry } from "../repositories/ipEntries.repo.js";
import { computeConnectivityStatus, inferSiteFromIp } from "./agents.service.js";
import { notFound } from "../utils/httpError.js";

// Namerno odvojeno od agents.service.js's resolveIpEntryId - taj je pisan za
// pun inventory-sync telo (OS/RDP-app/hasIzvolteFolder detekcija itd.).
// Manager nema ništa od toga - samo ip/hostname pri enroll-u, pa ne postoji
// ništa vredno deljenja osim same "nađi ili napravi ip_entry" ideje.
async function resolveManagerIpEntryId(managerId, { ip, hostname }) {
  let ipEntryId = await findIpEntryIdByIp(ip);
  if (!ipEntryId) {
    ipEntryId = await insertIpEntry({
      ip,
      ipNumeric: ipToNumeric(ip),
      computerName: emptyToNull(hostname),
      rdpApp: null,
      os: null,
      osArchitecture: null,
      hasIzvolteFolder: false,
      department: null,
      site: inferSiteFromIp(ip),
      description: null,
      entryType: "computer",
    });
  }

  await linkManagerToIpEntry(managerId, ipEntryId);
  return ipEntryId;
}

export async function enrollManager(dto) {
  const managerUid = crypto.randomUUID();
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const id = await insertManager({
    managerUid,
    apiKeyHash,
    hostname: emptyToNull(dto.hostname),
    managerVersion: emptyToNull(dto.managerVersion),
  });

  await resolveManagerIpEntryId(id, { ip: dto.ip, hostname: dto.hostname });

  const manager = await findManagerById(id);

  return {
    managerId: manager.managerUid,
    apiKey,
    enrolledAt: manager.enrolledAt,
  };
}

export async function heartbeatManager(managerId, dto, remoteIp) {
  const affected = await updateHeartbeat(managerId, {
    hostname: dto.hostname !== undefined ? emptyToNull(dto.hostname) : undefined,
    managerVersion:
      dto.managerVersion !== undefined ? emptyToNull(dto.managerVersion) : undefined,
    netdeskAgentServiceStatus:
      dto.netdeskAgentServiceStatus !== undefined
        ? emptyToNull(dto.netdeskAgentServiceStatus)
        : undefined,
    netdeskAgentStartMode:
      dto.netdeskAgentStartMode !== undefined ? emptyToNull(dto.netdeskAgentStartMode) : undefined,
    lastIp: remoteIp,
  });

  if (!affected) {
    throw notFound("Manager nije pronađen");
  }

  const manager = await findManagerById(managerId);

  return {
    ok: true,
    serverTime: new Date().toISOString(),
    manager: {
      managerId: manager.managerUid,
      status: manager.status,
      lastHeartbeatAt: manager.lastHeartbeatAt,
    },
  };
}

// Za AgentDetailView.vue "Manager" panel - null kad Manager nikad nije
// enrollovao na ovoj mašini (stari mailbox-only Manager, ili nema ga uopšte -
// backend te dve situacije ne može da razlikuje, videti napomenu u planu).
export async function getManagerByIpEntryId(ipEntryId) {
  const manager = await findManagerByIpEntryId(ipEntryId);
  if (!manager) return null;

  return {
    managerId: manager.id,
    managerVersion: manager.managerVersion,
    status: manager.status,
    lastHeartbeatAt: manager.lastHeartbeatAt,
    connectivityStatus: computeConnectivityStatus(manager.lastHeartbeatAt),
    netdeskAgentServiceStatus: manager.netdeskAgentServiceStatus,
    netdeskAgentStartMode: manager.netdeskAgentStartMode,
  };
}

export async function revokeManagerService(id) {
  const affected = await revokeManagerById(id);
  if (!affected) {
    throw notFound("Manager nije pronađen");
  }
  return await findManagerById(id);
}

export async function deleteManagerService(id) {
  const manager = await findManagerById(id);
  if (!manager) {
    throw notFound("Manager nije pronađen");
  }
  await deleteManagerById(id);
  return { success: true };
}
