import { pool } from "../db/pool.js";
import { buildLikeSearch } from "../utils/sqlSearch.js";

// Poklapa cdq.domain sa fd.domain kad je isti ILI kad je cdq.domain
// poddomen fd.domain-a (npr. cdq="a.example.com" poklapa fd="example.com").
// Namerno 6x EXISTS sa OR umesto "EXISTS (... WHERE fd.domain IN (cdq.domain,
// SUBSTRING_INDEX(...), ...))" (prethodni oblik) - taj IN-oblik je bio
// dovoljno brz DOK se koristio samo u SELECT listi (računa se samo za
// LIMIT-ovanih ~50 redova), ali kad je isti izraz iskorišćen i kao WHERE
// filter (blacklistedOnly - vidi listDnsQueries ispod), EXPLAIN je pokazao
// da MariaDB za IN-oblik NE radi indeksirani lookup po iteraciji, nego pun
// scan celog uq_flagged_domain indeksa PO SVAKOM REDU computer_dns_queries
// (DEPENDENT SUBQUERY, type=index, ne ref/unique_subquery) - uživo testirano
// sa ~90k sintetičkih flagged_domains redova, upit nije završio ni posle
// 120s. 6x EXISTS sa jednakošću (fd.domain = <jedan izraz>) po grani
// omogućava MariaDB-u da svaku granu MATERIJALIZUJE JEDNOM (temp tabela sa
// indeksom, izgrađena samo jednom za ceo upit, ne po redu) i onda radi
// indeksiran lookup po redu - isti rezultat (proveren identičan broj
// poklapanja), ali suštinski druga (i jedina održiva na ovoj skali)
// vremenska složenost.
export const FLAGGED_DOMAIN_MATCH_SQL = `
  (
    EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = cdq.domain)
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -2))
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -3))
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -4))
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -5))
    OR EXISTS (SELECT 1 FROM flagged_domains fd WHERE fd.domain = SUBSTRING_INDEX(cdq.domain, '.', -6))
  )
`;

// Za razliku od insertEventLogsBulk (INSERT IGNORE - event logovi su
// append-only distinktni redovi), DNS upiti se agregiraju PO (ip_entry_id,
// domain) - broj distinktnih domena po računaru je ograničen (hiljade
// tokom meseci), dok bi jedan red po pojedinačnom upitu (desetine hiljada
// dnevno po mašini) neograničeno rastao. UNIQUE KEY na (ip_entry_id,
// domain) čini ovo idempotentnim - agent koji ponovo pošalje isti batch
// posle prekinute veze samo dodaje na postojeći count, ne duplira.
export async function upsertDnsQueriesBulk(rows) {
  if (!rows.length) return;

  const values = rows.map((item) => [
    item.ip_entry_id,
    item.domain,
    item.first_seen,
    item.last_seen,
    item.query_count,
  ]);

  await pool.query(
    `
    INSERT INTO computer_dns_queries
    (
      ip_entry_id,
      domain,
      first_seen,
      last_seen,
      query_count
    )
    VALUES ?
    ON DUPLICATE KEY UPDATE
      first_seen = LEAST(first_seen, VALUES(first_seen)),
      last_seen = GREATEST(last_seen, VALUES(last_seen)),
      query_count = query_count + VALUES(query_count)
    `,
    [values],
  );
}

export async function listDnsQueries({ search, site, ipEntryId, blacklistedOnly, page, limit, sortBy, sortOrder }) {
  const whereParts = [];
  const params = [];

  const { where: searchWhere, params: searchParams } = buildLikeSearch(
    ["cdq.domain", "ie.computer_name", "ie.ip", "ie.department"],
    search,
  );
  if (searchWhere) {
    whereParts.push(searchWhere);
    params.push(...searchParams);
  }
  if (site) {
    whereParts.push("ie.site = ?");
    params.push(site);
  }
  if (ipEntryId) {
    // Za "DNS" tab na Agent Detail strani - istorija upita SAMO za tog
    // agentovog računara, isti obrazac kao PDSU event log tab (fetchuje po
    // ipEntryId, ne po agentId - DNS podaci su u bazi vezani za ip_entries,
    // ne za agents).
    whereParts.push("cdq.ip_entry_id = ?");
    params.push(ipEntryId);
  }
  if (blacklistedOnly) {
    // Isti FLAGGED_DOMAIN_MATCH_SQL izraz kao isBlacklisted kolona ispod -
    // jedno mesto za definiciju "poklapanja", ne duplirana logika koja bi
    // mogla da se razmimoiđe.
    whereParts.push(FLAGGED_DOMAIN_MATCH_SQL);
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const offset = (page - 1) * limit;

  const [[{ total }]] = await pool.execute(
    `
    SELECT COUNT(*) AS total
    FROM computer_dns_queries cdq
    JOIN ip_entries ie ON ie.id = cdq.ip_entry_id
    ${whereSql}
    `,
    params,
  );

  const [rows] = await pool.execute(
    `
    SELECT
      cdq.id,
      cdq.domain,
      cdq.first_seen AS firstSeen,
      cdq.last_seen AS lastSeen,
      cdq.query_count AS queryCount,
      ie.id AS ipEntryId,
      ie.ip,
      ie.computer_name AS computerName,
      ie.department,
      ie.site,
      ${FLAGGED_DOMAIN_MATCH_SQL} AS isBlacklisted
    FROM computer_dns_queries cdq
    JOIN ip_entries ie ON ie.id = cdq.ip_entry_id
    ${whereSql}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );

  return { items: rows, total: Number(total) || 0 };
}

// =========================
// Crna lista domena (flagged_domains) - isti CRUD obrazac kao
// flagged.repo.js (software/services), ali smešten ovde (ne u flagged.repo.js)
// jer je namerno admin-only (isto kao DNS logovi sami), ne operator-writable
// kao flagged_software/flagged_services.
// =========================

// Paginirano - flagged_domains ima ~88k redova otkad se dnevno sinhronizuje
// sa spoljnim izvorima (domainBlacklistSync.service.js), vraćanje SVIH
// odjednom je bilo renderovalo 88k <tr> elemenata na DNS Logs strani i
// kočilo je (otkriveno uživo).
export async function listFlaggedDomains({ search, page, limit }) {
  const { where, params } = buildLikeSearch(["domain"], search);
  const whereSql = where ? `WHERE ${where}` : "";
  const offset = (page - 1) * limit;

  const [[{ total }]] = await pool.execute(
    `SELECT COUNT(*) AS total FROM flagged_domains ${whereSql}`,
    params,
  );

  const [rows] = await pool.execute(
    `
    SELECT
      id,
      domain,
      reason,
      created_by_user_id AS createdByUserId,
      created_at AS createdAt
    FROM flagged_domains
    ${whereSql}
    ORDER BY domain
    LIMIT ? OFFSET ?
    `,
    [...params, limit, offset],
  );
  return { items: rows, total: Number(total) || 0 };
}

export async function findFlaggedDomainMatch(domain) {
  const [rows] = await pool.execute(
    `SELECT id FROM flagged_domains WHERE LOWER(domain) = LOWER(?) LIMIT 1`,
    [domain],
  );
  return rows?.[0] || null;
}

export async function insertFlaggedDomain({ domain, reason, createdByUserId }) {
  const [result] = await pool.execute(
    `
    INSERT INTO flagged_domains (domain, reason, created_by_user_id)
    VALUES (?, ?, ?)
    `,
    [domain, reason ?? null, createdByUserId ?? null],
  );
  return result.insertId;
}

export async function deleteFlaggedDomain(id) {
  const [result] = await pool.execute(`DELETE FROM flagged_domains WHERE id = ?`, [id]);
  return result.affectedRows;
}

// Masovno seed-ovanje iz spoljnih izvora (domainBlacklistSync.service.js) -
// INSERT IGNORE (isti uq_flagged_domain kao pojedinačan insertFlaggedDomain
// iznad) znači da se ručno dodati/već postojeći domeni nikad ne prepisuju
// niti brišu, samo se dodaju novi. Deljeno u manje batch-eve (ne jedan
// insert od desetina hiljada redova) da se izbegne max_allowed_packet rizik.
const BULK_INSERT_CHUNK_SIZE = 1000;

export async function bulkInsertFlaggedDomains(rows) {
  if (!rows.length) return 0;

  let affected = 0;
  for (let i = 0; i < rows.length; i += BULK_INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + BULK_INSERT_CHUNK_SIZE);
    const values = chunk.map((r) => [r.domain, r.reason ?? null]);
    const [result] = await pool.query(
      `INSERT IGNORE INTO flagged_domains (domain, reason) VALUES ?`,
      [values],
    );
    affected += result.affectedRows;
  }
  return affected;
}
