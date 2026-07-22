import {
  EnrollSchema,
  HeartbeatSchema,
  InventorySyncSchema,
} from "../dtos/agents.dto.js";
import {
  enrollAgent,
  heartbeat,
  listAgentsService,
  agentFilterOptionsService,
  listComputersWithoutAgentService,
  getAgentService,
  revokeAgentService,
  syncAgentInventory,
} from "../services/agents.service.js";
import { DEPLOYMENT_GROUPS } from "../dtos/agentReleases.dto.js";
import { toInt, clamp } from "../utils/numbers.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";

const STATUS_FILTERS = new Set(["active", "revoked"]);
const CONNECTIVITY_FILTERS = new Set(["online", "stale", "offline", "unknown"]);
const DEPLOYMENT_GROUP_FILTERS = new Set(DEPLOYMENT_GROUPS);
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateFilter(value) {
  return DATE_ONLY_RE.test(String(value || "")) ? value : undefined;
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

export async function listAgentsController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 200);
  const search = String(req.query.search || "").trim();
  const status = STATUS_FILTERS.has(req.query.status) ? req.query.status : "all";
  const connectivityStatus = CONNECTIVITY_FILTERS.has(req.query.connectivityStatus)
    ? req.query.connectivityStatus
    : undefined;
  const deploymentGroup = DEPLOYMENT_GROUP_FILTERS.has(req.query.deploymentGroup)
    ? req.query.deploymentGroup
    : undefined;
  const os = String(req.query.os || "").trim() || undefined;
  const enrolledFrom = dateFilter(req.query.enrolledFrom);
  const enrolledTo = dateFilter(req.query.enrolledTo);
  const heartbeatFrom = dateFilter(req.query.heartbeatFrom);
  const heartbeatTo = dateFilter(req.query.heartbeatTo);

  const out = await listAgentsService({
    page,
    limit,
    search,
    status,
    connectivityStatus,
    deploymentGroup,
    os,
    enrolledFrom,
    enrolledTo,
    heartbeatFrom,
    heartbeatTo,
  });
  res.json(out);
}

export async function agentFilterOptionsController(req, res) {
  const out = await agentFilterOptionsService();
  res.json(out);
}

export async function listComputersWithoutAgentController(req, res) {
  const page = clamp(toInt(req.query.page, 1), 1, 1_000_000);
  const limit = clamp(toInt(req.query.limit, 50), 1, 200);
  const search = String(req.query.search || "").trim();

  const out = await listComputersWithoutAgentService({ page, limit, search });
  res.json(out);
}

export async function getAgentController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");
  const agent = await getAgentService(id);
  res.json(agent);
}

export async function revokeAgentController(req, res) {
  const id = parseIdParam(req, "id", "ID agenta");
  const agent = await revokeAgentService(id);
  res.json(agent);
}
