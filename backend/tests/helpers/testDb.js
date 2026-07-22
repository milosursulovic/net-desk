import { pool } from "../../db/pool.js";

/**
 * Integration tests run against the real local dev MySQL DB (same one the
 * whole project has been live-verified against all session) rather than a
 * mock, since mocking would miss exactly the kind of bugs found live here
 * (mysql2 JSON auto-parse differences, schema drift, merge/pick shadowing).
 *
 * To avoid ever touching real data: test IPs come from RFC 5737 TEST-NET-3
 * (203.0.113.0/24), reserved for documentation/testing and guaranteed to
 * never collide with this org's real 10.230.x.x network. Test hostnames/
 * agent_uids are prefixed with VITEST_TEST_. Every test that creates rows
 * must clean them up (ideally via afterEach in the test file) - these
 * helpers make that a one-liner.
 */

let counter = 0;

export function testIp() {
  counter = (counter + 1) % 254;
  return `203.0.113.${counter + 1}`;
}

export function testHostname(suffix = "") {
  return `VITEST_TEST_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${suffix}`;
}

export async function deleteTestIpEntry(ipEntryId) {
  if (!ipEntryId) return;
  const [[row]] = await pool.query(
    "SELECT metadata_id FROM ip_entries WHERE id = ?",
    [ipEntryId],
  );
  await pool.execute("DELETE FROM ip_entries WHERE id = ?", [ipEntryId]);
  if (row?.metadata_id) {
    await pool.execute("DELETE FROM computer_metadata WHERE id = ?", [
      row.metadata_id,
    ]);
  }
}

export async function deleteTestAgent(agentId) {
  if (!agentId) return;
  await pool.execute("DELETE FROM agents WHERE id = ?", [agentId]);
}

export function testPushEndpoint() {
  return `https://fcm.googleapis.com/fcm/send/VITEST_TEST_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function deleteTestPushSubscription(endpoint) {
  if (!endpoint) return;
  await pool.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", [endpoint]);
}

export async function assertNoLeakedTestData() {
  const [[{ cnt: agentCnt }]] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM agents WHERE hostname LIKE 'VITEST_TEST_%'",
  );
  const [[{ cnt: ipCnt }]] = await pool.query(
    "SELECT COUNT(*) AS cnt FROM ip_entries WHERE ip LIKE '203.0.113.%'",
  );
  if (agentCnt > 0 || ipCnt > 0) {
    throw new Error(
      `Leaked test data: ${agentCnt} agents, ${ipCnt} ip_entries still present`,
    );
  }
}
