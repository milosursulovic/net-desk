import { pool } from "../db/pool.js";

export async function getSettingValue(key) {
  const [rows] = await pool.execute(
    "SELECT setting_value AS value FROM app_settings WHERE setting_key = ? LIMIT 1",
    [key],
  );
  return rows?.[0]?.value ?? null;
}

export async function listStoredSettings() {
  const [rows] = await pool.execute(
    "SELECT setting_key AS `key`, setting_value AS value, updated_at AS updatedAt FROM app_settings",
  );
  return rows;
}

export async function upsertSetting(key, value, updatedByUserId) {
  await pool.execute(
    `
    INSERT INTO app_settings (setting_key, setting_value, updated_by_user_id)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by_user_id = VALUES(updated_by_user_id)
    `,
    [key, value, updatedByUserId],
  );
}
