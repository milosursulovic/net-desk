import { pool } from "../db/pool.js";

export async function createSoftwareSync(req, res) {
  try {
    const { computer, software } = req.body;

    if (!computer || !Array.isArray(software)) {
      return res.status(400).json({ ok: false, error: "Invalid payload" });
    }

    // 1. find computer (ip_entries)
    const [machines] = await pool.query(
      "SELECT id FROM ip_entries WHERE ip = ?",
      [computer],
    );

    if (machines.length === 0) {
      return res.status(404).json({ ok: false, error: "Unknown computer" });
    }

    const ipEntryId = machines[0].id;

    let processed = 0;

    // 2. loop software
    for (const s of software) {
      const name = s.DisplayName;
      const version = s.DisplayVersion;
      const publisher = s.Publisher;
      const installDate = s.InstallDate;

      if (!name) continue;

      // 3. find or insert software
      const [existing] = await pool.query(
        "SELECT software_id FROM software WHERE display_name = ? AND publisher = ?",
        [name, publisher],
      );

      let softwareId;

      if (existing.length === 0) {
        const [insert] = await pool.query(
          "INSERT INTO software (display_name, publisher) VALUES (?, ?)",
          [name, publisher],
        );
        softwareId = insert.insertId;
      } else {
        softwareId = existing[0].software_id;
      }

      // 4. upsert relation
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

      processed++;
    }

    return res.json({
      ok: true,
      computer,
      received: software.length,
      processed,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false });
  }
}
