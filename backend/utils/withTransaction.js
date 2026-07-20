/**
 * Zajednički begin/commit/rollback/release wrapper - zamenjuje ručno pisan
 * try/beginTransaction/commit/catch-rollback/finally-release pattern
 * (viđen i u repositories/metadata.repo.js kao beginTx/commitTx/rollbackTx
 * trojka, i inline u utils/ipEntryService.js).
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
