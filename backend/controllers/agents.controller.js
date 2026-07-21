import {
  EnrollSchema,
  HeartbeatSchema,
  InventorySyncSchema,
} from "../dtos/agents.dto.js";
import {
  enrollAgent,
  heartbeat,
  listAgentsService,
  listComputersWithoutAgentService,
  getAgentService,
  revokeAgentService,
  syncAgentInventory,
} from "../services/agents.service.js";
import { toInt, clamp } from "../utils/numbers.js";
import { parseIdParam } from "../utils/idParam.js";
import { badRequest } from "../utils/httpError.js";

const STATUS_FILTERS = new Set(["active", "revoked"]);

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

  const out = await listAgentsService({ page, limit, search, status });
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
