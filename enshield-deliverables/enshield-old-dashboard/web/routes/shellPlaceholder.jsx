export function ShellPlaceholderPage({ label }) {
  return (
    <section className="esd-card esd-shell-placeholder" aria-labelledby="placeholder-title">
      <h2 id="placeholder-title">{label}</h2>
      <p>This workspace is not available yet.</p>
    </section>
  );
}
