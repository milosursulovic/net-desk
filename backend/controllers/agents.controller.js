import {
  EnrollSchema,
  HeartbeatSchema,
  InventorySyncSchema,
  ProcessKillExemptSchema,
} from "../dtos/agents.dto.js";
import {
  AgentDeploymentGroupSchema,
  BatchAgentDeploymentGroupSchema,
} from "../dtos/deploymentGroups.dto.js";
import {
  enrollAgent,
  heartbeat,
  listAgentsService,
  listAgentIdsService,
  agentFilterOptionsService,
  listComputersWithoutAgentService,
  listAllComputersWithoutAgentService,
  getAgentService,
  revokeAgentService,
  deleteAgentService,
  syncAgentInventory,
  setAgentProcessKillExemptService,
  addAgentDeploymentGroupService,
  removeAgentDeploymentGroupService,
  addAgentsDeploymentGroupService,
} from "../services/agents.service.js";
import { getManagerByIpEntryId } from "../services/managers.service.js";
import { SITES } from "../dtos/ipAddresses.dto.js";
import { toInt, clamp } from "../utils/numbers.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";
import { sendTablePdf } from "../utils/pdfTable.js";

const STATUS_FILTERS = new Set(["active", "revoked"]);
const CONNECTIVITY_FILTERS = new Set(["online", "stale", "offline", "unknown"]);
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateFilter(value) {
  return DATE_ONLY_RE.test(String(value || "")) ? value : undefined;
}

function siteFilter(value) {
  return SITES.includes(value) ? value : undefined;
}

export async function enrollController(req, res) {
  const parsed = EnrollSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const result = await enrollAgent(parsed.data);
  res.status(201).json(result);
}

export async function heartbeatController(req, res) {
  const parsed = HeartbeatSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await heartbeat(req.agent.id, parsed.data, req.ip);
  res.json(out);
}

export async function pingController(req, res) {
  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    agentId: req.agent.agentUid,
  });
}

export async function inventoryController(req, res) {
  const parsed = InventorySyncSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await syncAgentInventory(req.agent, parsed.data);
  res.json(out);
}

// Shared between listAgentsController (paginated) and listAgentIdsController
// ("select all matching the filter") - same query-param shape, one place to change.
// department/os/version/deploymentGroup are multiselects on the frontend -
// the same key URLSearchParams.append-ed several times reaches Express as an
// array (qs-style parsing), exactly one value as a bare string - it is always
// normalized to an array (empty when the filter wasn't sent) so the repo
// layer never has to branch on "is this a string or an array".
function toFilterArray(raw) {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((v) => String(v || "").trim()).filter(Boolean);
}

function parseAgentListFilters(query) {
  return {
    search: String(query.search || "").trim(),
    status: STATUS_FILTERS.has(query.status) ? query.status : "all",
    connectivityStatus: CONNECTIVITY_FILTERS.has(query.connectivityStatus)
      ? query.connectivityStatus
      : undefined,
    // Free text (same treatment as os/version/department below) - groups
    // are no longer limited to a fixed 4-value list.
    deploymentGroup: toFilterArray(query.deploymentGroup),
    os: toFilterArray(query.os),
    osArchitecture: String(query.osArchitecture || "").trim() || undefined,
    version: toFilterArray(query.version),
    versionNot: toFilterArray(query.versionNot),
    department: toFilterArray(query.department),
    site: siteFilter(query.site),
    enrolledFrom: dateFilter(query.enrolledFrom),
    enrolledTo: dateFilter(query.enrolledTo),
    heartbeatFrom: dateFilter(query.heartbeatFrom),
    heartbeatTo: dateFilter(query.heartbeatTo),
    antivirusInactive: query.antivirusInactive === "true",
    firewallInactive: query.firewallInactive === "true",
    windowsUpdateInactive: query.windowsUpdateInactive === "true",
    agentOfflineIpOnline: query.agentOfflineIpOnline === "true",
    serviceFilesMismatch: query.serviceFilesMismatch === "true",
    processKillExempt: query.processKillExempt === "true",
    deploymentGroupOsOverlap: query.deploymentGroupOsOverlap === "true",
    noDeploymentGroup: query.noDeploymentGroup === "true",
    hasManagerChannel:
      query.hasManagerChannel === "true" ? true : query.hasManagerChannel === "false" ? false : undefined,
    trustedRootCertInstalled:
      query.trustedRootCertInstalled === "true" ? true : query.trustedRootCertInstalled === "false" ? false : undefined,
    intermediateCertInstalled:
      query.intermediateCertInstalled === "true" ? true : query.intermediateCertInstalled === "false" ? false : undefined,
    secureDnsDisabled:
      query.secureDnsDisabled === "true" ? true : query.secureDnsDisabled === "false" ? false : undefined,
    managerVersion: toFilterArray(query.managerVersion),
    managerVersionNot: toFilterArray(query.managerVersionNot),
  };
}

export async function listAgentsController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 200);

  const out = await listAgentsService({ page, limit, ...parseAgentListFilters(req.query) });
  res.json(out);
}

export async function listAgentIdsController(req, res) {
  const out = await listAgentIdsService(parseAgentListFilters(req.query));
  res.json(out);
}

export async function agentFilterOptionsController(req, res) {
  const out = await agentFilterOptionsService(siteFilter(req.query.site));
  res.json(out);
}

export async function listComputersWithoutAgentController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 200);
  const search = String(req.query.search || "").trim();
  const site = siteFilter(req.query.site);

  const out = await listComputersWithoutAgentService({ page, limit, search, site });
  res.json(out);
}

export async function exportComputersWithoutAgentPdfController(req, res) {
  const search = String(req.query.search || "").trim();
  const entries = await listAllComputersWithoutAgentService(search, siteFilter(req.query.site));
  const dateStamp = new Date().toISOString().slice(0, 10);

  sendTablePdf(res, {
    title: "NetDesk — Računari bez agenta",
    subtitle: `Ukupno: ${entries.length} — generisano ${dateStamp}`,
    filename: `NetDesk_bez_agenta_${dateStamp}.pdf`,
    columns: [
      { header: "Računar", key: "computerName", width: 160 },
      { header: "IP", key: "ip", width: 100 },
      { header: "Odeljenje", key: "department", width: 140 },
      { header: "OS", key: "os", width: 200 },
      { header: "Status", key: "onlineLabel", width: 100 },
    ],
    rows: entries.map((e) => ({
      ...e,
      onlineLabel: e.isOnline ? "Online" : "Offline",
    })),
    emptyText: "Svi računari imaju agenta.",
  });
}

export async function getAgentController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");
  const agent = await getAgentService(id);
  res.json(agent);
}

// Kept separate from getAgentController (not folded into its response) so
// the shape of that already-used endpoint/its tests isn't touched - the
// Manager panel on AgentDetailView.vue calls it as a separate request.
export async function getAgentManagerStatusController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");
  const agent = await getAgentService(id);
  const manager = await getManagerByIpEntryId(agent.ipEntryId);
  res.json({ manager });
}

export async function revokeAgentController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");
  const agent = await revokeAgentService(id);
  res.json(agent);
}

export async function deleteAgentController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");
  await deleteAgentService(id);
  res.status(204).end();
}

export async function setProcessKillExemptController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");

  const parsed = ProcessKillExemptSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const agent = await setAgentProcessKillExemptService(id, parsed.data.processKillExempt);
  res.json(agent);
}

export async function addAgentDeploymentGroupController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");

  const parsed = AgentDeploymentGroupSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const agent = await addAgentDeploymentGroupService(id, parsed.data.groupName);
  res.json(agent);
}

export async function removeAgentDeploymentGroupController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");
  const groupName = decodeURIComponent(req.params.groupName || "").trim();
  if (!groupName) throw badRequest("Neispravan naziv grupe");

  const agent = await removeAgentDeploymentGroupService(id, groupName);
  res.json(agent);
}

export async function addAgentsDeploymentGroupController(req, res) {
  const parsed = BatchAgentDeploymentGroupSchema.safeParse(req.body || {});
  if (!parsed.success) throw badRequest("Neispravan format podataka");

  const out = await addAgentsDeploymentGroupService(parsed.data.agentIds, parsed.data.groupName);
  res.json(out);
}
