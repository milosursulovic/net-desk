import mysql from "mysql2/promise";
import { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME } from "../config/env.js";
import { recordQuery } from "../utils/dbQueryMetrics.js";

export const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASS,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // mysql2's `charset` option actually takes a COLLATION name, not a
  // charset - "utf8mb4_general_ci" here affects string sort/comparison
  // order (including for Serbian text), not just byte encoding.
  charset: "utf8mb4_general_ci",
});

// Transparent timing wrap for the server-health dashboard's query stats -
// every repo call already goes through pool.execute/pool.query, so
// instrumenting here covers the whole app without touching call sites.
// Note: queries run through withTransaction's PoolConnection (not the pool
// object itself) aren't captured - acceptable for a rough diagnostic, not a
// full APM.
function timed(rawFn) {
  return async function timedQuery(...args) {
    const startedAt = process.hrtime.bigint();
    try {
      return await rawFn(...args);
    } finally {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const sql = typeof args[0] === "string" ? args[0] : args[0]?.sql;
      recordQuery(sql, durationMs);
    }
  };
}

pool.execute = timed(pool.execute.bind(pool));
pool.query = timed(pool.query.bind(pool));
