/**
 * Geolocation sub-fields — purely visual.
 *
 * A `geo` field expands into TWO real columns (`<parent>_latitude`,
 * `<parent>_longitude` of type REAL) on submit. This component renders the
 * visual indicator that those sub-columns exist. No props needed because the
 * column names are derived from the parent at submit time and not shown here.
 */
export function GeoSubFields() {
  const subs = [
    { key: "latitude", label: "Latitude", icon: "↕" },
    { key: "longitude", label: "Longitude", icon: "↔" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 px-2 pb-1">
      {subs.map((s) => (
        <div
          key={s.key}
          className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-2/60"
        >
          <span className="w-5 h-5 rounded-full bg-brand/10 text-brand flex items-center justify-center shrink-0 text-[11px] font-semibold">
            {s.icon}
          </span>
          <span className="text-[12px] text-ink-muted truncate">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
