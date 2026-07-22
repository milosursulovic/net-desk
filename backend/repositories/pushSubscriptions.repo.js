import { pool } from "../db/pool.js";

export async function upsertPushSubscription({ userId, endpoint, p256dh, auth }) {
  await pool.execute(
    `
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      p256dh = VALUES(p256dh),
      auth = VALUES(auth)
    `,
    [userId, endpoint, p256dh, auth],
  );
}

export async function deletePushSubscriptionByEndpoint(endpoint) {
  const [r] = await pool.execute(
    `DELETE FROM push_subscriptions WHERE endpoint = ?`,
    [endpoint],
  );
  return r.affectedRows;
}

export async function listPushSubscriptions() {
  const [rows] = await pool.execute(
    `SELECT id, user_id AS userId, endpoint, p256dh, auth FROM push_subscriptions`,
  );
  return rows || [];
}

// Prune subscriptions the push service told us are gone (410 Gone / 404) -
// browser unsubscribed, uninstalled the PWA, or cleared site data without
// ever calling the unsubscribe endpoint, so this is the only place stale
// rows get cleaned up.
export async function deletePushSubscriptionsByIds(ids) {
  if (!ids.length) return 0;
  const [r] = await pool.execute(
    `DELETE FROM push_subscriptions WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  return r.affectedRows;
}
