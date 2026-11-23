export default function Loading() {
  return (
    <section aria-busy="true" aria-live="polite">
      <h1>Evaluation runs</h1>
      <div className="notice" role="status">
        Loading saved evaluations…
      </div>
    </section>
  );
}
