import { pool } from "../db/pool.js";

// Every FK-shaped relationship in the schema, including the ones NOT backed
// by a real database foreign key (computer_metadata has none - see below) -
// mirrors the manual audit run during the July 2026 production data cleanup
// (KORISNIK-PC's metadata_id desync + two ghost rows pointing at a deleted
// ip_entry). Kept as a flat list (not derived from information_schema) so
// the nullable/desync special cases stay explicit and reviewable.
const RELATIONSHIPS = [
  { table: "agents", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id", nullable: true },
  { table: "computer_available_updates", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "computer_drivers", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "computer_event_logs", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "computer_metadata", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "computer_printers", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "computer_services", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "computer_software", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "computer_updates", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "ip_status_history", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "printers", column: "host_computer_id", parentTable: "ip_entries", parentColumn: "id", nullable: true },
  { table: "printer_connected_computers", column: "ip_entry_id", parentTable: "ip_entries", parentColumn: "id" },
  { table: "agent_jobs", column: "agent_id", parentTable: "agents", parentColumn: "id" },
  { table: "agent_monitoring", column: "agent_id", parentTable: "agents", parentColumn: "id" },
  { table: "agent_monitoring_history", column: "agent_id", parentTable: "agents", parentColumn: "id" },
  { table: "agent_update_log", column: "agent_id", parentTable: "agents", parentColumn: "id" },
  { table: "vnc_sessions", column: "agent_id", parentTable: "agents", parentColumn: "id" },
  { table: "computer_metadata_gpus", column: "metadata_id", parentTable: "computer_metadata", parentColumn: "id" },
  { table: "computer_metadata_nics", column: "metadata_id", parentTable: "computer_metadata", parentColumn: "id" },
  { table: "computer_metadata_ram_modules", column: "metadata_id", parentTable: "computer_metadata", parentColumn: "id" },
  { table: "computer_metadata_storage", column: "metadata_id", parentTable: "computer_metadata", parentColumn: "id" },
];

function orphanWhere(rel) {
  const nullGuard = rel.nullable ? `t.${rel.column} IS NOT NULL AND ` : "";
  return `${nullGuard}NOT EXISTS (SELECT 1 FROM \`${rel.parentTable}\` p WHERE p.${rel.parentColumn} = t.${rel.column})`;
}

export async function auditGhostReferences() {
  const results = [];

  for (const rel of RELATIONSHIPS) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS c FROM \`${rel.table}\` t WHERE ${orphanWhere(rel)}`,
    );
    results.push({
      table: rel.table,
      column: rel.column,
      references: `${rel.parentTable}.${rel.parentColumn}`,
      orphanCount: Number(rows[0]?.c) || 0,
    });
  }

  // computer_metadata has no DB-level FK back to ip_entries (verified live)
  // - ip_entries.metadata_id is a denormalized pointer maintained only by
  // application code (txAttachMetadataToIpEntry), so it can drift out of
  // sync: a real computer_metadata row exists, but the pointer is NULL.
  const [desyncRows] = await pool.query(`
    SELECT COUNT(*) AS c
    FROM ip_entries ie
    JOIN computer_metadata cm ON cm.ip_entry_id = ie.id
    WHERE ie.metadata_id IS NULL
  `);
  results.push({
    table: "ip_entries",
    column: "metadata_id",
    references: "computer_metadata.id (desinhronizovan pokazivač, ne ghost red)",
    orphanCount: Number(desyncRows[0]?.c) || 0,
  });

  return results;
}

export async function cleanGhostReferences() {
  const cleaned = [];

  for (const rel of RELATIONSHIPS) {
    const [result] = await pool.query(
      `DELETE t FROM \`${rel.table}\` t WHERE ${orphanWhere(rel)}`,
    );
    if (result.affectedRows > 0) {
      cleaned.push({ table: rel.table, column: rel.column, deleted: result.affectedRows });
    }
  }

  const [fixResult] = await pool.query(`
    UPDATE ip_entries ie
    JOIN computer_metadata cm ON cm.ip_entry_id = ie.id
    SET ie.metadata_id = cm.id
    WHERE ie.metadata_id IS NULL
  `);
  if (fixResult.affectedRows > 0) {
    cleaned.push({ table: "ip_entries", column: "metadata_id", fixed: fixResult.affectedRows });
  }

  return cleaned;
}
