import { pool } from "../db/pool.js";

// One row per agent per snapshot (tied to daily report generation, not
// every heartbeat - agent_monitoring already updates every ~30s, and
// storing that cadence forever would explode this table for no benefit;
// daily granularity is plenty for a "days until threshold" trend later).
export async function insertMonitoringSnapshot(rows) {
  if (!rows.length) return;

  const values = rows.map((r) => [
    r.agentId,
    r.cpuLoadPct,
    r.ramLoadPct,
    r.diskUsedPct,
    r.diskFreeGb,
    r.recordedAt,
  ]);

  await pool.query(
    `
    INSERT INTO agent_monitoring_history
    (agent_id, cpu_load_pct, ram_load_pct, disk_used_pct, disk_free_gb, recorded_at)
    VALUES ?
    `,
    [values],
  );
}

// Current agent_monitoring is 1:1 upsert-latest (see agents.repo.js) - this
// is the source read for taking a snapshot of "everyone's current values"
// at report-generation time.
export async function listCurrentMonitoringForAllAgents() {
  const [rows] = await pool.execute(
    `
    SELECT
      agent_id AS agentId,
      cpu_load_pct AS cpuLoadPct,
      ram_load_pct AS ramLoadPct,
      disk_used_pct AS diskUsedPct,
      disk_free_gb AS diskFreeGb
    FROM agent_monitoring
    `,
  );
  return rows;
}

// One bulk query for every agent's history in the window (not one query per
// agent) - the caller groups by agentId in JS. Joined with hostname since
// the report needs it for display, not just the agent id.
export async function listMonitoringHistorySince(since) {
  const [rows] = await pool.execute(
    `
    SELECT
      h.agent_id AS agentId,
      a.hostname,
      h.disk_used_pct AS diskUsedPct,
      h.recorded_at AS recordedAt
    FROM agent_monitoring_history h
    JOIN agents a ON a.id = h.agent_id
    WHERE h.recorded_at >= ?
    ORDER BY h.agent_id, h.recorded_at ASC
    `,
    [since],
  );
  return rows;
}
