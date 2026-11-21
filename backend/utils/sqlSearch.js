/**
 * Builds "WHERE col1 LIKE ? OR col2 LIKE ? ..." for a simple search across several
 * columns. Columns from `prefixColumns` get "term%" (prefix) instead of
 * "%term%" (contains) - used e.g. for the IP column, where a prefix search
 * can use the index.
 *
 * Returns { where: "", params: [] } when term is empty - the caller decides
 * whether the default WHERE should be "1=1" or omitted.
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
