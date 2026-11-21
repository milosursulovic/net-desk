import crypto from "crypto";
import { generateApiKey, hashApiKey } from "../utils/apiKey.js";
import { emptyToNull } from "../utils/strings.js";
import { ipToNumeric } from "../utils/ip.js";
import {
  insertManager,
  findManagerById,
  findManagerByIpEntryId,
  updateHeartbeat,
  linkManagerToIpEntry,
  revokeOtherActiveManagers,
} from "../repositories/managers.repo.js";
import { findIpEntryIdByIp, insertIpEntry } from "../repositories/ipEntries.repo.js";
import { computeConnectivityStatus, inferSiteFromIp } from "./agents.service.js";
import { notFound } from "../utils/httpError.js";

// Deliberately separate from agents.service.js's resolveIpEntryId - that one is written for
// a full inventory-sync body (OS/RDP-app/hasIzvolteFolder detection etc.).
// The Manager has none of that - only ip/hostname at enroll, so there's
// nothing worth sharing apart from the "find or create ip_entry" idea itself.
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

  const ipEntryId = await resolveManagerIpEntryId(id, { ip: dto.ip, hostname: dto.hostname });

  // Enroll is called again every time the Manager service loses its
  // credentials (reinstall/reprovisioning) - the new registration for the SAME
  // ip_entry_id replaces the old one, it isn't added next to it.
  await revokeOtherActiveManagers(ipEntryId, id);

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

// For AgentDetailView.vue's "Manager" panel - null when the Manager has never
// enrolled on this machine (an old mailbox-only Manager, or none at all -
// the backend can't tell those two situations apart, see the note in the plan).
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

