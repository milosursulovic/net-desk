import crypto from "crypto";
import { generateApiKey, hashApiKey } from "../utils/apiKey.js";
import { emptyToNull } from "../utils/strings.js";
import { ipToNumeric } from "../utils/ip.js";
import { paginate } from "../utils/pagination.js";
import {
  insertAgent,
  findAgentById,
  updateHeartbeat,
  listAgents,
  revokeAgentById,
  linkAgentToIpEntry,
  upsertAgentMonitoring,
  findAgentMonitoring,
  updateAgentDeploymentGroup,
} from "../repositories/agents.repo.js";
import {
  findIpEntryIdByIp,
  insertIpEntry,
  updateIpEntryPatch,
  listComputersWithoutAgent,
} from "../repositories/ipEntries.repo.js";
import { patchMetadataForIpEntry } from "./metadata.service.js";
import {
  syncComputerSoftware,
  syncComputerDrivers,
  syncComputerServices,
  syncComputerUpdates,
  syncComputerPrinters,
  syncComputerAvailableUpdates,
} from "./pdsu.service.js";
import { ingestEventLogs } from "./eventLogs.service.js";
import { notFound } from "../utils/httpError.js";

export async function enrollAgent(dto) {
  const agentUid = crypto.randomUUID();
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const id = await insertAgent({
    agentUid,
    apiKeyHash,
    hostname: emptyToNull(dto.hostname),
    osCaption: emptyToNull(dto.osCaption),
    osVersion: emptyToNull(dto.osVersion),
    osBuild: emptyToNull(dto.osBuild),
    agentVersion: emptyToNull(dto.agentVersion),
  });

  const agent = await findAgentById(id);

  return {
    agentId: agent.agentUid,
    apiKey,
    enrolledAt: agent.enrolledAt,
  };
}

export async function heartbeat(agentId, dto, remoteIp) {
  const affected = await updateHeartbeat(agentId, {
    hostname: dto.hostname !== undefined ? emptyToNull(dto.hostname) : undefined,
    agentVersion:
      dto.agentVersion !== undefined ? emptyToNull(dto.agentVersion) : undefined,
    lastIp: remoteIp,
  });

  if (!affected) {
    throw notFound("Agent nije pronađen");
  }

  if (dto.monitoring) {
    await upsertAgentMonitoring(agentId, dto.monitoring);
  }

  const agent = await findAgentById(agentId);

  return {
    ok: true,
    serverTime: new Date().toISOString(),
    agent: {
      agentId: agent.agentUid,
      status: agent.status,
      lastHeartbeatAt: agent.lastHeartbeatAt,
    },
  };
}

// Both thresholds are generous multiples of the agent's default
// HeartbeatIntervalSeconds (30s) - online tolerates several missed
// heartbeats before flagging "stale" (network hiccup, not necessarily
// down), and "offline" only kicks in well past that, to avoid false
// alarms from a single slow/delayed check-in.
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
const STALE_THRESHOLD_MS = 30 * 60 * 1000;

function computeConnectivityStatus(lastHeartbeatAt) {
  if (!lastHeartbeatAt) return "unknown";
  const age = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (age <= ONLINE_THRESHOLD_MS) return "online";
  if (age <= STALE_THRESHOLD_MS) return "stale";
  return "offline";
}

export async function listAgentsService({ page, limit, search, status }) {
  const offset = (page - 1) * limit;
  const { items, total } = await listAgents({ search, status, limit, offset });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  const itemsWithStatus = items.map((a) => ({
    ...a,
    connectivityStatus: computeConnectivityStatus(a.lastHeartbeatAt),
  }));

  return { items: itemsWithStatus, page: safePage, limit, total, totalPages, search, status };
}

export async function listComputersWithoutAgentService({ page, limit, search }) {
  return await listComputersWithoutAgent({ search, page, limit });
}

export async function getAgentService(id) {
  const agent = await findAgentById(id);
  if (!agent) {
    throw notFound("Agent nije pronađen");
  }
  const monitoring = await findAgentMonitoring(id);
  return {
    ...agent,
    connectivityStatus: computeConnectivityStatus(agent.lastHeartbeatAt),
    monitoring,
  };
}

export async function setAgentDeploymentGroupService(id, deploymentGroup) {
  const affected = await updateAgentDeploymentGroup(id, deploymentGroup);
  if (!affected) {
    throw notFound("Agent nije pronađen");
  }
  return await findAgentById(id);
}

export async function revokeAgentService(id) {
  const affected = await revokeAgentById(id);
  if (!affected) {
    throw notFound("Agent nije pronađen");
  }
  return await findAgentById(id);
}

async function resolveIpEntryId(agent, body) {
  if (agent.ipEntryId) {
    // Once an agent is linked to an ip_entry, every sync unconditionally
    // overwrites ip/ip_numeric on that same row rather than re-resolving by
    // IP - this is what lets a DHCP lease change without spawning a
    // duplicate ip_entries row for the same physical machine.
    const sets = ["ip = ?", "ip_numeric = ?", "entry_type = ?"];
    const params = [body.ip, ipToNumeric(body.ip), "computer"];

    if (body.hostname !== undefined) {
      sets.push("computer_name = ?");
      params.push(emptyToNull(body.hostname));
    }
    if (body.department !== undefined) {
      sets.push("department = ?");
      params.push(emptyToNull(body.department));
    }

    await updateIpEntryPatch(agent.ipEntryId, sets.join(", "), params);
    return agent.ipEntryId;
  }

  let ipEntryId = await findIpEntryIdByIp(body.ip);
  if (!ipEntryId) {
    ipEntryId = await insertIpEntry({
      ip: body.ip,
      ipNumeric: ipToNumeric(body.ip),
      computerName: emptyToNull(body.hostname),
      rdpApp: null,
      os: null,
      department: emptyToNull(body.department),
      description: null,
      remoteScript: null,
      entryType: "computer",
    });
  }

  await linkAgentToIpEntry(agent.id, ipEntryId);
  return ipEntryId;
}

export async function syncAgentInventory(agent, body) {
  const ipEntryId = await resolveIpEntryId(agent, body);

  const metadata = await patchMetadataForIpEntry(ipEntryId, body);

  if (Array.isArray(body.software)) {
    await syncComputerSoftware(ipEntryId, body.software);
  }
  if (Array.isArray(body.drivers)) {
    await syncComputerDrivers(ipEntryId, body.drivers);
  }
  if (Array.isArray(body.services)) {
    await syncComputerServices(ipEntryId, body.services);
  }
  if (Array.isArray(body.updates)) {
    await syncComputerUpdates(ipEntryId, body.updates);
  }
  if (Array.isArray(body.printers)) {
    await syncComputerPrinters(ipEntryId, body.printers);
  }
  if (Array.isArray(body.availableUpdates)) {
    await syncComputerAvailableUpdates(ipEntryId, body.availableUpdates);
  }
  if (Array.isArray(body.eventLogs)) {
    await ingestEventLogs(ipEntryId, body.eventLogs);
  }

  return { ok: true, ipEntryId, metadata };
}
