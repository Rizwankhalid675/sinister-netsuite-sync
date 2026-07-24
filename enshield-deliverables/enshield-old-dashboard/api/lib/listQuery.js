const SAFE_SEARCH = /^[\p{L}\p{N}\s#@._'&()/:-]*$/u;

export function parsePageSize(value, fallback = 25, max = 100) {
  if (value == null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(1, parsed));
}

export function parseSearch(value) {
  if (value == null || value === "") return "";
  const search = String(value).trim().replace(/\s+/g, " ");
  if (search.length > 100 || !SAFE_SEARCH.test(search)) {
    const error = new Error("Invalid search");
    error.statusCode = 400;
    throw error;
  }
  return search;
}

export function parseEnumFilter(value, allowed) {
  if (value == null || value === "") return "";
  if (!allowed.has(value)) {
    const error = new Error("Invalid filter");
    error.statusCode = 400;
    throw error;
  }
  return value;
}

export function pageInfoFor(records) {
  return {
    hasNextPage: Boolean(records?.hasNextPage),
    endCursor: records?.endCursor || null,
  };
}
