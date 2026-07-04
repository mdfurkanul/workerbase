export function ViewQueryTab({
  viewQuery,
  setViewQuery,
}: {
  viewQuery: string;
  setViewQuery: (v: string) => void;
}) {
  return (
    <section className="space-y-2">
      <span className="label-mono">SQL query</span>
      <textarea
        required
        value={viewQuery}
        onChange={(e) => setViewQuery(e.target.value)}
        placeholder="SELECT id, title FROM posts WHERE views > 100 ORDER BY views DESC"
        rows={5}
        className="field-input font-mono text-[13px]"
      />
      <p className="text-[12px] text-ink-faint">
        Read-only single SELECT. No DDL/DML. Validated server-side.
      </p>
    </section>
  );
}
