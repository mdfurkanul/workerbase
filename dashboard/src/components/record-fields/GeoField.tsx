/**
 * Lat/lon pair widget for `geo` fields.
 *
 * The backend stores geo as TWO REAL columns (`<name>_latitude` and
 * `<name>_longitude`). The parent grouping pass detects the pair and
 * renders ONE `GeoField` instead of two independent NumberFields. The
 * widget reads both values from the parent state map and writes both
 * back via `onLatChange` / `onLonChange` so the parent state continues
 * to use the underlying column names.
 */

interface GeoFieldProps {
  /** Display label for the pair (the base field name without `_latitude`). */
  label: string;
  required?: boolean;
  lat: string;
  lon: string;
  onLatChange: (v: string) => void;
  onLonChange: (v: string) => void;
  errorLat?: string;
  errorLon?: string;
}

export function GeoField({
  label,
  required,
  lat,
  lon,
  onLatChange,
  onLonChange,
  errorLat,
  errorLon,
}: GeoFieldProps) {
  return (
    <div>
      <span className="label-mono">
        {label}{required ? " *" : ""}{" "}
        <span className="text-ink-faint normal-case font-normal">· geo</span>
      </span>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <label className="block">
          <span className="text-[11px] text-ink-muted font-mono">latitude</span>
          <input
            type="number"
            step="any"
            min={-90}
            max={90}
            value={lat}
            onChange={(e) => onLatChange(e.target.value)}
            placeholder="-90 .. 90"
            className={`field-input ${errorLat ? "border-err" : ""}`}
          />
          {errorLat && <div className="text-err text-[12px] mt-1">{errorLat}</div>}
        </label>
        <label className="block">
          <span className="text-[11px] text-ink-muted font-mono">longitude</span>
          <input
            type="number"
            step="any"
            min={-180}
            max={180}
            value={lon}
            onChange={(e) => onLonChange(e.target.value)}
            placeholder="-180 .. 180"
            className={`field-input ${errorLon ? "border-err" : ""}`}
          />
          {errorLon && <div className="text-err text-[12px] mt-1">{errorLon}</div>}
        </label>
      </div>
    </div>
  );
}

/** Validate a latitude / longitude string pair. */
export function validateGeo(lat: string, lon: string): { lat?: string; lon?: string } {
  const out: { lat?: string; lon?: string } = {};
  if (lat.trim() !== "") {
    const n = Number(lat);
    if (Number.isNaN(n)) out.lat = "Latitude must be a number";
    else if (n < -90 || n > 90) out.lat = "Latitude must be between -90 and 90";
  }
  if (lon.trim() !== "") {
    const n = Number(lon);
    if (Number.isNaN(n)) out.lon = "Longitude must be a number";
    else if (n < -180 || n > 180) out.lon = "Longitude must be between -180 and 180";
  }
  return out;
}
