export function PageStatus({ loading, error, empty, noun, onRetry }) {
  if (loading) {
    return <div className="esd-loading" role="status" aria-live="polite">Loading {noun}…</div>;
  }
  if (error === "forbidden") {
    return (
      <div className="esd-empty" role="status">
        <p className="esd-empty-title">Access restricted</p>
        <p className="esd-empty-desc">You don’t have permission to view {noun}.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="esd-error" role="status" aria-live="polite">
        Couldn’t load {noun}. <button className="esd-link-button" type="button" onClick={onRetry}>Try again</button>
      </div>
    );
  }
  if (empty) {
    return (
      <div className="esd-empty" role="status">
        <p className="esd-empty-title">No {noun} to show</p>
        <p className="esd-empty-desc">No {noun} match this view. Try adjusting your filters.</p>
      </div>
    );
  }
  return null;
}

export function ListToolbar({ search, onSearch, status, onStatus, statuses = [] }) {
  return (
    <form className="esd-toolbar" onSubmit={(event) => event.preventDefault()}>
      <label>
        <span className="esd-visually-hidden">Search</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search"
        />
      </label>
      {statuses.length > 0 ? (
        <label>
          <span className="esd-visually-hidden">Status</span>
          <select value={status} onChange={(event) => onStatus(event.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      ) : null}
    </form>
  );
}

export function PageNavigation({ hasPrevious, hasNext, onPrevious, onNext }) {
  return hasPrevious || hasNext ? (
    <div className="esd-pagination">
      {hasPrevious ? <button className="esd-btn" type="button" onClick={onPrevious}>Previous page</button> : null}
      {hasNext ? <button className="esd-btn" type="button" onClick={onNext}>Next page</button> : null}
    </div>
  ) : null;
}
