import { pool } from "../db/pool.js";

export async function upsert({ ipEntryId, softwareId, version, installDate }) {
  await pool.query(
    `INSERT INTO computer_software
     (ip_entry_id, software_id, display_version, install_date, last_seen)
     VALUES (?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       display_version = VALUES(display_version),
       install_date = VALUES(install_date),
       last_seen = NOW()`,
    [ipEntryId, softwareId, version, installDate],
  );
}
