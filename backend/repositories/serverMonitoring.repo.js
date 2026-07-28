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

// Table sizes change slowly (nothing like request/query rates) - cached
// with a longer TTL than systemMetrics.js's CPU/RAM so a page full of
// admins polling live/ doesn't re-scan information_schema every 4s.
const SIZE_CACHE_MS = 60_000;
let sizeCache = null;
let sizeCacheAt = 0;

export async function getDbSizeSnapshot() {
  const now = Date.now();
  if (sizeCache && now - sizeCacheAt < SIZE_CACHE_MS) return sizeCache;

  const [rows] = await pool.query(
    `
    SELECT
      table_name AS tableName,
      (data_length + index_length) AS sizeBytes
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
    ORDER BY sizeBytes DESC
    `,
  );

  const totalBytes = rows.reduce((sum, r) => sum + (Number(r.sizeBytes) || 0), 0);

  sizeCache = {
    totalSizeMb: Math.round((totalBytes / 1024 / 1024) * 10) / 10,
    topTables: rows.slice(0, 5).map((r) => ({
      table: r.tableName,
      sizeMb: Math.round(((Number(r.sizeBytes) || 0) / 1024 / 1024) * 10) / 10,
    })),
  };
  sizeCacheAt = now;
  return sizeCache;
}

export async function insertServerSnapshot(s) {
  await pool.execute(
    `
    INSERT INTO server_monitoring_history
    (
      cpu_load_pct, ram_used_pct, ram_used_mb, ram_total_mb, disk_used_pct,
      process_rss_mb, process_heap_used_mb, db_threads_connected,
      requests_per_min, avg_response_ms, error_rate_pct,
      db_size_mb, avg_query_ms, p95_response_ms, p99_response_ms,
      mariadb_cpu_pct, mariadb_mem_mb
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      s.dbSizeMb,
      s.avgQueryMs,
      s.p95ResponseMs,
      s.p99ResponseMs,
      s.mariadbCpuPct,
      s.mariadbMemMb,
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
      error_rate_pct AS errorRatePct,
      db_size_mb AS dbSizeMb,
      avg_query_ms AS avgQueryMs,
      p95_response_ms AS p95ResponseMs,
      p99_response_ms AS p99ResponseMs,
      mariadb_cpu_pct AS mariadbCpuPct,
      mariadb_mem_mb AS mariadbMemMb
    FROM server_monitoring_history
    WHERE recorded_at >= NOW() - INTERVAL ? HOUR
    ORDER BY recorded_at ASC
    `,
    [hours],
  );
  return rows;
}
