/**
 * Dashboard date/time formatting driven by per-superuser prefs.
 *
 * prefs.timezone       — IANA zone (e.g. "America/New_York"); "" / undefined
 *                        means "browser default" (`undefined` to Intl).
 * prefs.dateTimeFormat — named preset, see FORMAT_PRESETS.
 *
 * Display helpers accept epoch-ms (number) or ISO string. Input helpers
 * convert between `<input type="datetime-local">` wall-clock strings and
 * epoch-ms using the user's timezone. Anything that fails to parse falls
 * back to the raw input so timestamps are never blank.
 */

export const DATE_TIME_FORMATS = [
  "iso8601",
  "compact",
  "long",
  "us",
  "european",
  "custom",
] as const;
export type DateTimeFormat = (typeof DATE_TIME_FORMATS)[number];

export interface DateTimePrefs {
  timezone?: string;
  dateTimeFormat?: DateTimeFormat;
  /** Token template used when `dateTimeFormat === "custom"`. */
  customDateTimePattern?: string;
}

/**
 * Reference table for the custom format tokens — surfaced in the UI as a
 * hint and consumed by `formatCustom` below. Supports the common subset
 * of Unicode / moment-style tokens users will reach for.
 */
export const CUSTOM_TOKENS: { token: string; meaning: string; example: string }[] = [
  { token: "YYYY", meaning: "4-digit year", example: "2026" },
  { token: "YY", meaning: "2-digit year", example: "26" },
  { token: "MMMM", meaning: "Long month name", example: "July" },
  { token: "MMM", meaning: "Short month name", example: "Jul" },
  { token: "MM", meaning: "2-digit month", example: "07" },
  { token: "DD", meaning: "2-digit day", example: "07" },
  { token: "HH", meaning: "Hour (24-hr, 2-digit)", example: "14" },
  { token: "hh", meaning: "Hour (12-hr, 2-digit)", example: "02" },
  { token: "mm", meaning: "Minutes", example: "30" },
  { token: "ss", meaning: "Seconds", example: "05" },
  { token: "a", meaning: "AM / PM", example: "PM" },
  { token: "Z", meaning: "UTC offset", example: "+05:00" },
  { token: "z", meaning: "Time zone short name", example: "GMT+5" },
];

const DEFAULT_CUSTOM_PATTERN = "YYYY-MM-DD HH:mm";

/** Resolve a possibly-empty timezone string to a usable IANA zone or undefined. */
export function resolveTimezone(tz: string | undefined | null): string | undefined {
  return tz && tz.length > 0 ? tz : undefined;
}

// ─────────────────────────────────────────────────────────────
//  Timezone list — full IANA set, grouped by region
// ─────────────────────────────────────────────────────────────

/**
 * All timezones the runtime knows about. `Intl.supportedValuesOf` is
 * available in modern browsers and the Workers runtime. Cast through
 * `Intl` as the lib-dom types in older TS versions don't expose it.
 */
function loadAllTimezones(): string[] {
  try {
    const fn = (Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    }).supportedValuesOf;
    const list = fn?.bind(Intl)?.("timeZone");
    return Array.isArray(list) && list.length > 0 ? list.slice() : FALLBACK_TIMEZONES;
  } catch {
    return FALLBACK_TIMEZONES.slice();
  }
}

/** Small hardcoded fallback in case `Intl.supportedValuesOf` is missing. */
const FALLBACK_TIMEZONES: string[] = [
  "UTC",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "America/Toronto", "America/Mexico_City",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Istanbul", "Europe/Moscow",
  "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
  "Asia/Dubai", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka",
  "Asia/Bangkok", "Asia/Singapore", "Asia/Shanghai", "Asia/Hong_Kong",
  "Asia/Tokyo", "Asia/Seoul", "Asia/Tehran",
  "Australia/Sydney", "Australia/Perth", "Pacific/Auckland", "Pacific/Honolulu",
];

export const ALL_TIMEZONES: string[] = loadAllTimezones();

export interface TimezoneGroup {
  region: string;
  zones: { value: string; label: string }[];
}

/**
 * Group IANA zones by leading region segment for browsability.
 * Always emits a synthetic "Browser default" entry at the top.
 */
export function groupTimezonesByRegion(
  zones: string[] = ALL_TIMEZONES,
): TimezoneGroup[] {
  // First, a synthetic "default" pseudo-group so the dropdown always
  // has a clear "use my browser" entry up top.
  const defaultGroup: TimezoneGroup = {
    region: "Default",
    zones: [{ value: "", label: "Browser default" }],
  };

  const buckets = new Map<string, { value: string; label: string }[]>();
  for (const z of zones) {
    const slash = z.indexOf("/");
    const region = slash >= 0 ? z.slice(0, slash) : "Other";
    // Label is the part after the region, with underscores → spaces.
    const label = slash >= 0 ? z.slice(slash + 1).replace(/_/g, " ") : z;
    if (!buckets.has(region)) buckets.set(region, []);
    buckets.get(region)!.push({ value: z, label });
  }

  const groups: TimezoneGroup[] = [defaultGroup];
  for (const [region, items] of Array.from(buckets.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    items.sort((a, b) => a.label.localeCompare(b.label));
    groups.push({ region, zones: items });
  }
  return groups;
}

/** Memoised grouped list — recomputed once per page load. */
export const GROUPED_TIMEZONES: TimezoneGroup[] = groupTimezonesByRegion();

/** Filter the full grouped list by a free-text search query. */
export function searchTimezones(query: string): TimezoneGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return GROUPED_TIMEZONES;
  // Always include the synthetic "Browser default" entry.
  const defaultGroup = GROUPED_TIMEZONES[0]!;
  const matched: TimezoneGroup[] = [defaultGroup];
  for (const g of GROUPED_TIMEZONES.slice(1)) {
    const zones = g.zones.filter(
      (z) =>
        z.value.toLowerCase().includes(q) || z.label.toLowerCase().includes(q),
    );
    if (zones.length > 0) matched.push({ region: g.region, zones });
  }
  return matched;
}

export const FORMAT_PRESETS: { value: DateTimeFormat; label: string; example: string }[] = [
  { value: "iso8601", label: "ISO 8601 (UTC)", example: "2026-07-07 14:30:05" },
  { value: "compact", label: "Compact", example: "2026-07-07 14:30" },
  { value: "long", label: "Long", example: "July 7, 2026, 2:30 PM" },
  { value: "us", label: "US (12-hr)", example: "07/07/2026 02:30 PM" },
  { value: "european", label: "European (24-hr)", example: "07/07/2026 14:30" },
];

// ─────────────────────────────────────────────────────────────
//  Display formatting
// ─────────────────────────────────────────────────────────────

/**
 * Heuristic: any epoch value below ~10^12 (Sept 2001 in ms) is almost
 * certainly in seconds, not ms. Used to paper over the codebase's
 * mixed second/millisecond storage until that's fully unified.
 */
const SECONDS_THRESHOLD = 1e12;

function toDate(input: number | string, assumeSeconds = false): Date | null {
  if (input === null || input === undefined || input === "") return null;
  if (typeof input === "number") {
    const ms = assumeSeconds ? input * 1000 : input;
    return new Date(ms);
  }
  // string — could be a number-string or ISO. Try numeric first if pure digits.
  if (/^\d+$/.test(input)) {
    const n = parseInt(input, 10);
    return new Date(assumeSeconds ? n * 1000 : n);
  }
  return new Date(input);
}

function isProbablySeconds(n: number): boolean {
  return typeof n === "number" && n > 0 && n < SECONDS_THRESHOLD;
}

/**
 * Build an Intl formatter for the given preset + timezone.
 * Returns null for the iso8601 preset (handled separately).
 */
function makeIntl(
  format: DateTimeFormat,
  timeZone: string | undefined,
): Intl.DateTimeFormat | null {
  const opts: Intl.DateTimeFormatOptions = {};
  switch (format) {
    case "compact":
      Object.assign(opts, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      break;
    case "long":
      Object.assign(opts, {
        year: "numeric", month: "long", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
      break;
    case "us":
      Object.assign(opts, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "numeric", minute: "2-digit", hour12: true,
      });
      break;
    case "european":
      Object.assign(opts, {
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false,
      });
      break;
    case "iso8601":
    default:
      return null;
  }
  try {
    return new Intl.DateTimeFormat(undefined, { ...opts, timeZone });
  } catch {
    // Invalid timezone — fall back without it.
    return new Intl.DateTimeFormat(undefined, opts);
  }
}

/**
 * Format a timestamp using the user's prefs.
 *
 * @param input  epoch-ms, epoch-seconds, ISO string, or any raw DB value
 *               (typed `unknown` so display callers don't have to narrow
 *               arbitrary record values before passing through)
 * @param prefs  system-wide prefs from /api/core/settings
 * @returns      formatted string (raw input on any failure)
 */
export function formatDateTime(
  input: unknown,
  prefs: DateTimePrefs | null | undefined,
): string {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input !== "number" && typeof input !== "string") return String(input);

  // Auto-detect seconds vs ms for numeric inputs.
  const assumeSeconds = typeof input === "number" && isProbablySeconds(input);
  const d = toDate(input, assumeSeconds);
  if (!d || Number.isNaN(d.getTime())) return String(input);

  const format = prefs?.dateTimeFormat ?? "iso8601";
  const tz = resolveTimezone(prefs?.timezone);

  if (format === "iso8601") {
    // Always UTC, seconds precision — matches the legacy Logs layout.
    return d.toISOString().replace("T", " ").slice(0, 19);
  }

  if (format === "custom") {
    const pattern =
      prefs?.customDateTimePattern && prefs.customDateTimePattern.length > 0
        ? prefs.customDateTimePattern
        : DEFAULT_CUSTOM_PATTERN;
    return formatCustom(d, pattern, tz);
  }

  const intl = makeIntl(format, tz);
  if (!intl) return String(input);
  try {
    return intl.format(d);
  } catch {
    return String(input);
  }
}

// ─────────────────────────────────────────────────────────────
//  Custom token formatter
// ─────────────────────────────────────────────────────────────

/**
 * Look up a single token's value via Intl.DateTimeFormat with the
 * minimal option set for that token. Returns the raw string for that
 * component in the user's timezone.
 */
function tokenValue(
  date: Date,
  token: string,
  timeZone: string | undefined,
): string {
  const base: Intl.DateTimeFormatOptions = { timeZone };
  switch (token) {
    case "YYYY":
      Object.assign(base, { year: "numeric" });
      break;
    case "YY":
      Object.assign(base, { year: "2-digit" });
      break;
    case "MMMM":
      Object.assign(base, { month: "long" });
      break;
    case "MMM":
      Object.assign(base, { month: "short" });
      break;
    case "MM":
      Object.assign(base, { month: "2-digit" });
      break;
    case "DD":
      Object.assign(base, { day: "2-digit" });
      break;
    case "HH":
      Object.assign(base, { hour: "2-digit", hour12: false });
      break;
    case "hh":
      Object.assign(base, { hour: "2-digit", hour12: true });
      break;
    case "mm":
      Object.assign(base, { minute: "2-digit" });
      break;
    case "ss":
      Object.assign(base, { second: "2-digit" });
      break;
    case "a":
      Object.assign(base, { hour: "numeric", hour12: true });
      break;
    case "Z":
      Object.assign(base, { timeZoneName: "longOffset" });
      break;
    case "z":
      Object.assign(base, { timeZoneName: "short" });
      break;
    default:
      return token; // unknown — leave the literal text untouched
  }
  try {
    const fmt = new Intl.DateTimeFormat(undefined, base);
    if (token === "a") {
      // Extract just the AM/PM literal.
      const parts = fmt.formatToParts(date);
      const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value;
      return dayPeriod ?? "";
    }
    if (token === "Z") {
      // formatToParts exposes timeZoneName as a part.
      const parts = fmt.formatToParts(date);
      const tzName = parts.find((p) => p.type === "timeZoneName")?.value;
      // Intl longOffset returns "GMT" for UTC — normalise.
      return tzName && tzName.length > 0 ? tzName : "";
    }
    return fmt.format(date);
  } catch {
    return token;
  }
}

/**
 * Render a `Date` using a free-form token template. Tokens are matched
 * greedily (longest first) so `MMMM` wins over `MM`. Non-token chars
 * are preserved verbatim. Wrap any literal text in square brackets to
 * insulate it from tokenisation, e.g. `[Q]Q` → "Q1".
 */
export function formatCustom(
  date: Date,
  pattern: string,
  timeZone: string | undefined,
): string {
  return rebuildWithLiterals(date, pattern, timeZone);
}

/** Walk the pattern, alternating between tokens and literal spans. */
function rebuildWithLiterals(
  date: Date,
  pattern: string,
  timeZone: string | undefined,
): string {
  const tokenRe =
    /(YYYY|YY|MMMM|MMM|MM|DD|HH|hh|mm|ss|a|Z|z)|(\[.+?\])/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(pattern)) !== null) {
    out += pattern.slice(last, m.index);
    if (m[1]) out += tokenValue(date, m[1], timeZone);
    else if (m[2]) out += m[2].slice(1, -1);
    last = m.index + m[0].length;
  }
  out += pattern.slice(last);
  return out;
}

/**
 * Relative "X ago" formatter. Used by the backups timeline.
 *
 * @param input  epoch-ms, epoch-seconds, ISO string, or any raw DB value
 */
export function formatRelative(
  input: unknown,
  prefs?: DateTimePrefs | null,
): string {
  if (input === null || input === undefined || input === "") return "";
  if (typeof input !== "number" && typeof input !== "string") return "";
  const assumeSeconds = typeof input === "number" && isProbablySeconds(input);
  const d = toDate(input, assumeSeconds);
  if (!d || Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month}mo ago`;
  return `${Math.floor(month / 12)}y ago`;
}

// ─────────────────────────────────────────────────────────────
//  Input conversion — datetime-local <-> epoch ms
// ─────────────────────────────────────────────────────────────

/**
 * Convert an `<input type="datetime-local">` wall-clock string
 * (e.g. "2026-07-07T14:30") interpreted in the given timezone
 * to a UTC epoch-ms timestamp.
 *
 * If `timeZone` is undefined/"" we let the browser interpret the
 * string as local time (the HTML default behaviour).
 */
export function wallClockToEpochMs(
  wallClock: string,
  timeZone?: string | null,
): number | null {
  if (!wallClock) return null;
  const tz = resolveTimezone(timeZone);
  if (!tz) {
    const t = new Date(wallClock).getTime();
    return Number.isNaN(t) ? null : t;
  }

  // 1. Parse the wall-clock pieces.
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    wallClock,
  );
  if (!m) {
    const t = new Date(wallClock).getTime();
    return Number.isNaN(t) ? null : t;
  }
  const [, yS, moS, dS, hS, miS, sS] = m;
  const y = Number(yS);
  const mo = Number(moS) - 1;
  const d = Number(dS);
  const h = Number(hS);
  const mi = Number(miS);
  const s = sS ? Number(sS) : 0;

  // 2. Compute the instant if the wall-clock were UTC.
  const asIfUtc = Date.UTC(y, mo, d, h, mi, s);

  // 3. Find what wall-clock that instant shows in the target zone.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(asIfUtc));
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const tzY = Number(get("year"));
  const tzMo = Number(get("month")) - 1;
  const tzD = Number(get("day"));
  const tzH = Number(get("hour")) % 24; // Intl sometimes returns "24" for midnight.
  const tzMi = Number(get("minute"));
  const tzS = Number(get("second"));
  const shownAsIfUtc = Date.UTC(tzY, tzMo, tzD, tzH, tzMi, tzS);

  // 4. The offset is the difference. Real UTC = asIfUtc + offset.
  //    Example: user types 14:30 in NY (EDT, UTC-4).
  //    asIfUtc = the instant where UTC shows 14:30.
  //    At that instant NY shows 10:30, so shownAsIfUtc = 10:30 numerical.
  //    offset = asIfUtc - shownAsIfUtc = +4h. Real UTC = 14:30 + 4h = 18:30. ✓
  return asIfUtc + (asIfUtc - shownAsIfUtc);
}

/**
 * Convert a UTC epoch-ms timestamp to an `<input type="datetime-local">`
 * wall-clock string ("yyyy-MM-ddTHH:mm") shown in the given timezone.
 */
export function epochMsToWallClock(
  epochMs: number,
  timeZone?: string | null,
): string {
  const tz = resolveTimezone(timeZone);
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const y = get("year");
  const mo = get("month");
  const da = get("day");
  const h = (Number(get("hour")) % 24).toString().padStart(2, "0");
  const mi = get("minute");
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

/**
 * Detect whether a numeric value is plausibly an epoch-seconds timestamp.
 * Useful for callers that need to upconvert before calling wall-clock helpers.
 */
export function looksLikeEpochSeconds(n: unknown): boolean {
  return typeof n === "number" && n > 0 && n < SECONDS_THRESHOLD;
}
