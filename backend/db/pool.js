import mysql from "mysql2/promise";
import { DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME } from "../config/env.js";

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
