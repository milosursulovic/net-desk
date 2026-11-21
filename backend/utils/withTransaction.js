/**
 * Shared begin/commit/rollback/release wrapper - replaces the hand-written
 * try/beginTransaction/commit/catch-rollback/finally-release pattern
 * (also seen in repositories/metadata.repo.js as the beginTx/commitTx/rollbackTx
 * trio, and inline in utils/ipEntryService.js).
 */
export async function withTransaction(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      /* connection already broken - ignore rollback failure */
    }
    throw err;
  } finally {
    conn.release();
  }
}
