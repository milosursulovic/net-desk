/**
 * Gradi "WHERE col1 LIKE ? OR col2 LIKE ? ..." za prostu pretragu preko više
 * kolona. Kolone iz `prefixColumns` dobijaju "term%" (prefix) umesto
 * "%term%" (contains) - koristi se npr. za IP kolonu gde prefix pretraga
 * može da iskoristi indeks.
 *
 * Vraća { where: "", params: [] } kad je term prazan - pozivalac odlučuje
 * da li default WHERE treba da bude "1=1" ili izostavljen.
 */
export function buildLikeSearch(columns, term, { prefixColumns = [] } = {}) {
  const q = String(term ?? "").trim();
  if (!q || columns.length === 0) return { where: "", params: [] };

  const contains = `%${q}%`;
  const prefix = `${q}%`;
  const prefixSet = new Set(prefixColumns);

  const clauses = [];
  const params = [];

  for (const col of columns) {
    clauses.push(`${col} LIKE ?`);
    params.push(prefixSet.has(col) ? prefix : contains);
  }

  return { where: `(${clauses.join(" OR ")})`, params };
}
