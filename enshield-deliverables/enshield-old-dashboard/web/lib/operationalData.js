const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

export function buildListUrl(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsv(filename, rows) {
  const blob = new Blob([`\uFEFF${toCsv(rows)}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const createPageState = (queryKey) => ({
  queryKey,
  cursor: "",
  history: [],
});

export const changePageQuery = (state, queryKey) =>
  state.queryKey === queryKey ? state : createPageState(queryKey);

export const nextPageState = (state, cursor) =>
  !cursor ? state : {
    ...state,
    cursor,
    history: [...state.history, state.cursor],
  };

export const previousPageState = (state) => {
  if (!state.history.length) return state;
  return {
    ...state,
    cursor: state.history.at(-1),
    history: state.history.slice(0, -1),
  };
};
