import { useCallback, useEffect, useMemo, useState } from "react";
import { buildListUrl, changePageQuery, createPageState, nextPageState, previousPageState } from "./operationalData.js";
import { useRole } from "./useRole.jsx";

export function usePagedResource(path, filters = {}) {
  const { selectedShopId } = useRole();
  const [rows, setRows] = useState([]);
  const [pageInfo, setPageInfo] = useState({ hasNextPage: false, endCursor: null });
  const stableFilters = useMemo(() => JSON.stringify(filters), [filters]);
  const queryKey = `${path}:${selectedShopId}:${stableFilters}`;
  const [page, setPage] = useState(() => createPageState(queryKey));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const effectivePage = changePageQuery(page, queryKey);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const params = { first: 25, shopId: selectedShopId, ...JSON.parse(stableFilters), after: effectivePage.cursor };
    fetch(buildListUrl(path, params), {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.success) {
          const reason = new Error(body.error || "Request failed");
          reason.status = response.status;
          throw reason;
        }
        return body;
      })
      .then((body) => {
        const resourceKey = Object.keys(body).find(
          (key) => Array.isArray(body[key])
        );
        setRows(resourceKey ? body[resourceKey] : []);
        setPageInfo(body.pageInfo || { hasNextPage: false, endCursor: null });
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") {
          setRows([]);
          setError(reason.status === 403 ? "forbidden" : reason.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, stableFilters, effectivePage.cursor, reloadKey, selectedShopId, queryKey]);

  const next = useCallback(() => {
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      setPage((current) => nextPageState(changePageQuery(current, queryKey), pageInfo.endCursor));
    }
  }, [pageInfo, queryKey]);

  return {
    rows,
    loading,
    error,
    hasNextPage: pageInfo.hasNextPage,
    hasPreviousPage: effectivePage.history.length > 0,
    next,
    previous: () => setPage((current) => previousPageState(changePageQuery(current, queryKey))),
    reset: () => setPage(createPageState(queryKey)),
    retry: () => setReloadKey((key) => key + 1),
  };
}
