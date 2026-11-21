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
  listAgentIds,
  listDistinctAgentOs,
  listDistinctAgentOsArchitectures,
  listDistinctAgentVersions,
  listDistinctManagerVersions,
  listDistinctAgentDeploymentGroups,
  revokeAgentById,
  deleteAgentById,
  linkAgentToIpEntry,
  upsertAgentMonitoring,
  findAgentMonitoring,
  findAgentWindowsUpdateStatus,
  findAgentIpEntry,
  updateAgentProcessKillExempt,
  updateAgentServiceFilesMismatch,
} from "../repositories/agents.repo.js";
import {
  listDeploymentGroups,
  listAgentDeploymentGroups,
  addAgentDeploymentGroup,
  removeAgentDeploymentGroup,
} from "../repositories/deploymentGroups.repo.js";
import { isFeatureEnabled } from "./appSettings.service.js";
import { checkServiceFilesMismatchService } from "./agentReleases.service.js";
import {
  findIpEntryIdByIp,
  insertIpEntry,
  updateIpEntryPatch,
  listComputersWithoutAgent,
  listAllComputersWithoutAgent,
  listDistinctDepartments,
} from "../repositories/ipEntries.repo.js";
import { patchMetadataForIpEntry } from "./metadata.service.js";
import { RDP_APP_PATTERNS } from "../dtos/ipAddresses.dto.js";
import {
  syncComputerSoftware,
  syncComputerDrivers,
  syncComputerServices,
  syncComputerUpdates,
  syncComputerPrinters,
  syncComputerAvailableUpdates,
} from "./pdsu.service.js";
import { ingestEventLogs } from "./eventLogs.service.js";
import { ingestDnsQueries } from "./dnsLogs.service.js";
import { ingestProcessDetections } from "./processDetections.service.js";
import { listDistinctReleaseDeploymentGroups } from "../repositories/agentReleases.repo.js";
import { notFound, badRequest } from "../utils/httpError.js";

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

  // The global switch (Config page, process_monitor_enabled) is deliberately
  // NOT passed to the agent as a separate field - instead it's OR-ed into
  // the EXISTING processKillExempt field before sending. The agent (AgentWorker.cs)
  // already treats "exempt" as "don't kill on this machine" with no distinction
  // whether it's due to the per-agent whitelist or the global switch-off -
  // zero changes/recompiles are needed on the C# side for this switch.
  const monitorEnabled = await isFeatureEnabled("process_monitor_enabled");

  return {
    ok: true,
    serverTime: new Date().toISOString(),
    agent: {
      agentId: agent.agentUid,
      status: agent.status,
      lastHeartbeatAt: agent.lastHeartbeatAt,
      // Boolean(...) on purpose - mysql2 returns TINYINT(1) as a JS number (0/1), and
      // C#'s HeartbeatAgentInfo.ProcessKillExempt is a real bool - Json.NET
      // throws JsonSerializationException on a number where it expects true/false.
      processKillExempt: Boolean(agent.processKillExempt) || !monitorEnabled,
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

export function computeConnectivityStatus(lastHeartbeatAt) {
  if (!lastHeartbeatAt) return "unknown";
  const age = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (age <= ONLINE_THRESHOLD_MS) return "online";
  if (age <= STALE_THRESHOLD_MS) return "stale";
  return "offline";
}

export async function listAgentsService({
  page,
  limit,
  search,
  status,
  connectivityStatus,
  deploymentGroup,
  os,
  osArchitecture,
  version,
  versionNot,
  department,
  site,
  enrolledFrom,
  enrolledTo,
  heartbeatFrom,
  heartbeatTo,
  antivirusInactive,
  firewallInactive,
  windowsUpdateInactive,
  agentOfflineIpOnline,
  serviceFilesMismatch,
  processKillExempt,
  deploymentGroupOsOverlap,
  noDeploymentGroup,
  hasManagerChannel,
  trustedRootCertInstalled,
  intermediateCertInstalled,
  secureDnsDisabled,
  managerVersion,
  managerVersionNot,
}) {
  const offset = (page - 1) * limit;
  const { items, total } = await listAgents({
    search,
    status,
    connectivityStatus,
    deploymentGroup,
    os,
    osArchitecture,
    version,
    versionNot,
    department,
    site,
    enrolledFrom,
    enrolledTo,
    heartbeatFrom,
    heartbeatTo,
    antivirusInactive,
    firewallInactive,
    windowsUpdateInactive,
    agentOfflineIpOnline,
    serviceFilesMismatch,
    processKillExempt,
    deploymentGroupOsOverlap,
    noDeploymentGroup,
    hasManagerChannel,
    trustedRootCertInstalled,
    intermediateCertInstalled,
    secureDnsDisabled,
    managerVersion,
    managerVersionNot,
    limit,
    offset,
  });
  const { page: safePage, totalPages } = paginate({ page, limit, total });

  const itemsWithStatus = items.map((a) => ({
    ...a,
    connectivityStatus: computeConnectivityStatus(a.lastHeartbeatAt),
  }));

  return { items: itemsWithStatus, page: safePage, limit, total, totalPages, search, status };
}

// For "select all matching the filter" on /agents - same filter shape as
// listAgentsService, without page/limit (all ids, not one page).
export async function listAgentIdsService(filters) {
  const ids = await listAgentIds(filters);
  return { ids };
}

export async function agentFilterOptionsService(site) {
  const os = await listDistinctAgentOs(site);
  const osArchitecture = await listDistinctAgentOsArchitectures(site);
  const version = await listDistinctAgentVersions(site);
  const managerVersion = await listDistinctManagerVersions(site);
  const department = await listDistinctDepartments(site);

  // Deployment groups are now SEPARATE from departments (deployment_groups_list,
  // not groups_list) - suggestions are the union of the predefined list, groups already in
  // use on agents, and groups targeted by releases. Site scope is
  // applied only to agents - releases aren't tied to a site.
  const [predefined, agentGroups, releaseGroups] = await Promise.all([
    listDeploymentGroups(),
    listDistinctAgentDeploymentGroups(site),
    listDistinctReleaseDeploymentGroups(),
  ]);
  const deploymentGroups = [...new Set([...predefined, ...agentGroups, ...releaseGroups])].sort(
    (a, b) => a.localeCompare(b),
  );

  return { os, osArchitecture, version, managerVersion, department, deploymentGroups };
}

export async function listComputersWithoutAgentService({ page, limit, search, site }) {
  return await listComputersWithoutAgent({ search, page, limit, site });
}

export async function listAllComputersWithoutAgentService(search, site) {
  return await listAllComputersWithoutAgent(search, site);
}

export async function getAgentService(id) {
  const agent = await findAgentById(id);
  if (!agent) {
    throw notFound("Agent nije pronađen");
  }
  const monitoring = await findAgentMonitoring(id);
  const windowsUpdateStatus = await findAgentWindowsUpdateStatus(agent.ipEntryId);
  const ipEntry = await findAgentIpEntry(agent.ipEntryId);
  const deploymentGroups = await listAgentDeploymentGroups(id);
  return {
    ...agent,
    connectivityStatus: computeConnectivityStatus(agent.lastHeartbeatAt),
    monitoring,
    windowsUpdateStatus,
    computerIp: ipEntry?.ip ?? null,
    site: ipEntry?.site ?? null,
    department: ipEntry?.department ?? null,
    description: ipEntry?.description ?? null,
    // Replaces findAgentById's GROUP_CONCAT string (same field name, only
    // display-only in the list) with a real array - the detail page adds/removes
    // individual groups through it.
    deploymentGroups,
  };
}

// Deployment groups directly drive auto-update targeting (checkForUpdateService
// in agentReleases.service.js looks at the intersection of the agent's groups and the release's
// targeted groups) - which is why add/remove is admin-only in the route.
export async function addAgentDeploymentGroupService(id, groupName) {
  const agent = await findAgentById(id);
  if (!agent) {
    throw notFound("Agent nije pronađen");
  }
  await addAgentDeploymentGroup(id, groupName);
  return await getAgentService(id);
}

export async function removeAgentDeploymentGroupService(id, groupName) {
  const agent = await findAgentById(id);
  if (!agent) {
    throw notFound("Agent nije pronađen");
  }
  await removeAgentDeploymentGroup(id, groupName);
  return await getAgentService(id);
}

// Bulk assignment - same "created/skipped" shape as createBatchJobService
// (agentJobs.service.js), sequential for the same reason (DB pool
// limit, a batch can target up to 500 agents at once).
export async function addAgentsDeploymentGroupService(agentIds, groupName) {
  const uniqueIds = [...new Set(agentIds)];
  const updated = [];
  const skipped = [];

  for (const agentId of uniqueIds) {
    const agent = await findAgentById(agentId);
    if (!agent) {
      skipped.push({ agentId, reason: "Agent nije pronađen" });
      continue;
    }
    await addAgentDeploymentGroup(agentId, groupName);
    updated.push({ agentId, hostname: agent.hostname });
  }

  return { updated, skipped };
}

// "Whitelist" - the agent still detects/logs watchlist processes on this
// computer (visibility/audit trail isn't lost), but NEVER kills them even
// when AgentSettings.KillWatchedProcesses is globally enabled (e.g. an IT admin
// uses TeamViewer for legitimate support on this machine).
export async function setAgentProcessKillExemptService(id, exempt) {
  const affected = await updateAgentProcessKillExempt(id, exempt);
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

// Requires the agent to ALREADY be 'revoked' - deleting an active agent would leave a
// machine that still has a valid api_key_hash and keeps trying heartbeat/poll
// against a deleted agent_id (agentAuth.middleware.js looks up by id,
// not by agent_uid - a vanished row means a 401 on every subsequent call from that
// machine, instead of a clean "revoked" response). Revoking first is a deliberate step.
export async function deleteAgentService(id) {
  const agent = await findAgentById(id);
  if (!agent) {
    throw notFound("Agent nije pronađen");
  }
  if (agent.status !== "revoked") {
    throw badRequest("Agent mora prvo biti povučen pre brisanja");
  }
  await deleteAgentById(id);
  return { success: true };
}

// Same UltraVNC matching pattern as listComputersWithoutUltravnc() in
// pdsuAnalytics.repo.js/hasUltravnc in ipEntries.repo.js - keep them in sync.
// Compares only against the service "name" field (not displayName), same as those
// places and the is_flagged EXISTS queries in pdsu.repo.js.
// Returns `undefined` when services weren't sent in this sync (don't touch the
// existing value), and `null`/a joined string when they WERE sent (full
// replace on every sync with a service list - same behavior as
// computer_name/department, even when none of the known tools are found).
function detectRdpApps(services) {
  if (!Array.isArray(services)) return undefined;

  const found = RDP_APP_PATTERNS.filter(({ patterns }) =>
    services.some((s) => {
      const name = String(s?.name ?? "").toLowerCase();
      return patterns.some((p) => name.includes(p));
    }),
  ).map((p) => p.label);

  return found.length ? found.join(", ") : null;
}

// The agent sends InventoryRequest with PascalCase fields (RawJsonSettings, see
// NetdeskApiClient.cs) - so the OS object and its Caption are read tolerantly
// in both casings, same pattern as metadata.service.js's pick().
function extractOsCaption(body) {
  const os = body?.OS ?? body?.os;
  if (!os) return undefined;
  return emptyToNull(os.Caption ?? os.caption);
}

function extractOsArchitecture(body) {
  const os = body?.OS ?? body?.os;
  if (!os) return undefined;
  return emptyToNull(os.Architecture ?? os.architecture);
}

// hasIzvolteFolder is nullable on the C# side (see InventoryModels.cs) - when
// not sent (the minimal event-log/DNS/process-detection syncs never
// set it), RawJsonSettings.NullValueHandling.Ignore omits it entirely
// from the JSON, so it's undefined here - "don't touch the existing value",
// same pattern as os/rdp_app.
function extractHasIzvolteFolder(body) {
  if (body?.hasIzvolteFolder === undefined || body?.hasIzvolteFolder === null) return undefined;
  return Boolean(body.hasIzvolteFolder);
}

// serviceFiles is optional, same pattern as hasIzvolteFolder above -
// InventoryCollector.CollectServiceFiles() fills it only on a FULL
// inventory sync (not on the minimal event-log/DNS/process-detection
// syncs), so it's undefined when not sent ("don't touch the existing
// service_files_mismatch flag", not "clear it").
function extractServiceFiles(body) {
  if (!Array.isArray(body?.serviceFiles)) return undefined;
  return body.serviceFiles
    .map((f) => ({ path: String(f?.path || "").trim(), size: Number(f?.sizeBytes) }))
    .filter((f) => f.path && Number.isFinite(f.size));
}

// trustedRootCertInstalled/intermediateCertInstalled/secureDnsDisabled are
// nullable on the C# side (SecurityPostureCollector.cs) just like
// hasIzvolteFolder above - undefined when the field wasn't sent ("don't touch the
// existing value"), and even when it WAS sent, null is a legitimate answer
// (the check couldn't run this cycle, e.g. the server with the reference
// certificate was unreachable) - unlike hasIzvolteFolder, here null is
// explicitly stored in the DB instead of being collapsed to false, because "not checked"
// and "confirmed absent" must remain distinguishable.
function extractTrustedRootCertInstalled(body) {
  if (body?.trustedRootCertInstalled === undefined) return undefined;
  return body.trustedRootCertInstalled === null ? null : Boolean(body.trustedRootCertInstalled);
}

function extractIntermediateCertInstalled(body) {
  if (body?.intermediateCertInstalled === undefined) return undefined;
  return body.intermediateCertInstalled === null ? null : Boolean(body.intermediateCertInstalled);
}

function extractSecureDnsDisabled(body) {
  if (body?.secureDnsDisabled === undefined) return undefined;
  return body.secureDnsDisabled === null ? null : Boolean(body.secureDnsDisabled);
}

// Guesses the location from the IP range ONLY for a brand-new entry (the first time
// we see that IP address) - doesn't touch site on an existing entry, because the
// admin may have corrected it by hand (e.g. a laptop physically moved, but still
// reporting from the old IP address). Bolnica 10.230.62.0/23 and dom_zdravlja
// 10.160.64.0/21 both fall entirely under their first-two-octet prefix,
// so a simple prefix is enough without full CIDR math.
export function inferSiteFromIp(ip) {
  if (typeof ip !== "string") return null;
  if (ip.startsWith("10.160.")) return "dom_zdravlja";
  if (ip.startsWith("10.230.")) return "bolnica";
  return null;
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

    const osCaption = extractOsCaption(body);
    if (osCaption !== undefined) {
      sets.push("os = ?");
      params.push(osCaption);
    }

    const rdpApp = detectRdpApps(body.services);
    if (rdpApp !== undefined) {
      sets.push("rdp_app = ?");
      params.push(rdpApp);
    }

    const osArchitecture = extractOsArchitecture(body);
    if (osArchitecture !== undefined) {
      sets.push("os_architecture = ?");
      params.push(osArchitecture);
    }

    const hasIzvolteFolder = extractHasIzvolteFolder(body);
    if (hasIzvolteFolder !== undefined) {
      sets.push("has_izvolte_folder = ?");
      params.push(hasIzvolteFolder ? 1 : 0);
    }

    const trustedRootCertInstalled = extractTrustedRootCertInstalled(body);
    if (trustedRootCertInstalled !== undefined) {
      sets.push("trusted_root_cert_installed = ?");
      params.push(trustedRootCertInstalled === null ? null : (trustedRootCertInstalled ? 1 : 0));
    }

    const intermediateCertInstalled = extractIntermediateCertInstalled(body);
    if (intermediateCertInstalled !== undefined) {
      sets.push("intermediate_cert_installed = ?");
      params.push(intermediateCertInstalled === null ? null : (intermediateCertInstalled ? 1 : 0));
    }

    const secureDnsDisabled = extractSecureDnsDisabled(body);
    if (secureDnsDisabled !== undefined) {
      sets.push("secure_dns_disabled = ?");
      params.push(secureDnsDisabled === null ? null : (secureDnsDisabled ? 1 : 0));
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
      rdpApp: detectRdpApps(body.services) ?? null,
      os: extractOsCaption(body) ?? null,
      osArchitecture: extractOsArchitecture(body) ?? null,
      hasIzvolteFolder: extractHasIzvolteFolder(body) ?? false,
      department: emptyToNull(body.department),
      site: inferSiteFromIp(body.ip),
      description: null,
      entryType: "computer",
      trustedRootCertInstalled: extractTrustedRootCertInstalled(body) ?? null,
      intermediateCertInstalled: extractIntermediateCertInstalled(body) ?? null,
      secureDnsDisabled: extractSecureDnsDisabled(body) ?? null,
    });
  }

  await linkAgentToIpEntry(agent.id, ipEntryId);
  return ipEntryId;
}

// Each of the steps below writes to ITS OWN table, keyed only by ipEntryId
// (already resolved) - none of them reads another's result, so they're safe to
// run in parallel instead of sequentially. Previously they were all awaited
// one after another - added up, one full inventory sync could take 8+
// seconds (each step a few hundred ms), which, with more agents
// syncing concurrently, started draining the shared DB connection pool (discovered
// live while expanding to the second site - see DB_CONNECTION_LIMIT in
// config/env.js). Promise.all reduces the total duration to roughly the duration of the
// slowest individual step instead of their sum.
export async function syncAgentInventory(agent, body) {
  const ipEntryId = await resolveIpEntryId(agent, body);

  const metadataPromise = patchMetadataForIpEntry(ipEntryId, body);
  const otherTasks = [];

  if (Array.isArray(body.software)) {
    otherTasks.push(syncComputerSoftware(ipEntryId, body.software));
  }
  if (Array.isArray(body.drivers)) {
    otherTasks.push(syncComputerDrivers(ipEntryId, body.drivers));
  }
  if (Array.isArray(body.services)) {
    otherTasks.push(syncComputerServices(ipEntryId, body.services));
  }
  if (Array.isArray(body.updates)) {
    otherTasks.push(syncComputerUpdates(ipEntryId, body.updates));
  }
  if (Array.isArray(body.printers)) {
    otherTasks.push(syncComputerPrinters(ipEntryId, body.printers));
  }
  if (Array.isArray(body.availableUpdates)) {
    otherTasks.push(syncComputerAvailableUpdates(ipEntryId, body.availableUpdates));
  }
  if (Array.isArray(body.eventLogs)) {
    otherTasks.push(ingestEventLogs(ipEntryId, body.eventLogs));
  }
  if (Array.isArray(body.dnsQueries)) {
    otherTasks.push(ingestDnsQueries(ipEntryId, body.dnsQueries));
  }
  if (Array.isArray(body.processDetections)) {
    otherTasks.push(ingestProcessDetections(ipEntryId, body.processDetections));
  }

  const serviceFiles = extractServiceFiles(body);
  if (serviceFiles !== undefined) {
    otherTasks.push(
      checkServiceFilesMismatchService(agent.agentVersion, serviceFiles).then(
        ({ mismatch, details }) => updateAgentServiceFilesMismatch(agent.id, mismatch, details),
      ),
    );
  }

  const [metadata] = await Promise.all([metadataPromise, ...otherTasks]);

  return { ok: true, ipEntryId, metadata };
}
