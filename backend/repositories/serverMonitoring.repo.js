import { pool } from "../db/pool.js";

export async function getDbSnapshot() {
  const [connRows] = await pool.query("SHOW STATUS LIKE 'Threads_connected'");
  const [maxRows] = await pool.query("SHOW VARIABLES LIKE 'max_connections'");
  const [slowRows] = await pool.query("SHOW STATUS LIKE 'Slow_queries'");

  return {
    threadsConnected: Number(connRows?.[0]?.Value) || 0,
    maxConnections: Number(maxRows?.[0]?.Value) || 0,
    slowQueriesTotal: Number(slowRows?.[0]?.Value) || 0,
  };
}

export async function insertServerSnapshot(s) {
  await pool.execute(
    `
    INSERT INTO server_monitoring_history
    (
      cpu_load_pct, ram_used_pct, ram_used_mb, ram_total_mb, disk_used_pct,
      process_rss_mb, process_heap_used_mb, db_threads_connected,
      requests_per_min, avg_response_ms, error_rate_pct
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      s.cpuLoadPct,
      s.ramUsedPct,
      s.ramUsedMb,
      s.ramTotalMb,
      s.diskUsedPct,
      s.processRssMb,
      s.processHeapUsedMb,
      s.dbThreadsConnected,
      s.requestsPerMin,
      s.avgResponseMs,
      s.errorRatePct,
    ],
  );
}

export async function listServerHistory(hours) {
  const [rows] = await pool.execute(
    `
    SELECT
      recorded_at AS recordedAt,
      cpu_load_pct AS cpuLoadPct,
      ram_used_pct AS ramUsedPct,
      ram_used_mb AS ramUsedMb,
      ram_total_mb AS ramTotalMb,
      disk_used_pct AS diskUsedPct,
      process_rss_mb AS processRssMb,
      process_heap_used_mb AS processHeapUsedMb,
      db_threads_connected AS dbThreadsConnected,
      requests_per_min AS requestsPerMin,
      avg_response_ms AS avgResponseMs,
      error_rate_pct AS errorRatePct
    FROM server_monitoring_history
    WHERE recorded_at >= NOW() - INTERVAL ? HOUR
    ORDER BY recorded_at ASC
    `,
    [hours],
  );
  return rows;
}
