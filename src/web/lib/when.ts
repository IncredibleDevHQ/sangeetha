/**
 * One way to write dates and times across Tulsi.
 *
 * The school keeps India time. Staff screens read the school's clock; families
 * and students read their own, so a family abroad sees local times. A time zone
 * is named ("India time", "London time") only when the viewer's clock differs
 * from the school's.
 */
export const SCHOOL_ZONE = "Asia/Kolkata";

export type WhenStyle =
  | "date" // 10 Oct
  | "day" // Sat 10 Oct
  | "long" // Saturday, 10 October
  | "time" // 10:00 am
  | "dayTime"; // Sat 10 Oct · 10:00 am
export type Clock = "school" | "viewer";

const LOCALE = "en-IN";
const PLACES: Record<string, string> = {
  "Asia/Kolkata": "India",
  "Asia/Calcutta": "India",
};

export function viewerZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || SCHOOL_ZONE;
}

/** "India time", "London time", "New York time". */
export function zoneName(zone: string) {
  const place =
    PLACES[zone] || zone.split("/").pop()?.replace(/_/g, " ") || zone;
  return place + " time";
}

/** The viewer's zone when it differs from the school's, otherwise "". */
export function differentZone() {
  const zone = viewerZone();
  return (PLACES[zone] || zone) === PLACES[SCHOOL_ZONE] ? "" : zone;
}

function resolve(value: string | Date, clock: Clock) {
  // A calendar date (a due day, an enrolment start) has no clock time: never shift it.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return { date: new Date(value + "T12:00:00Z"), zone: "UTC", timed: false };
  return {
    date: value instanceof Date ? value : new Date(value),
    zone: clock === "school" ? SCHOOL_ZONE : viewerZone(),
    timed: true,
  };
}

function dateText(date: Date, zone: string, weekday: boolean, long = false) {
  const thisYear = date.getFullYear() === new Date().getFullYear();
  const text = new Intl.DateTimeFormat(LOCALE, {
    timeZone: zone,
    ...(weekday ? { weekday: long ? "long" : "short" } : {}),
    day: "numeric",
    month: long ? "long" : "short",
    ...(thisYear ? {} : { year: "numeric" }),
  }).format(date);
  // "Sat, 10 Oct" reads as "Sat 10 Oct"; the long form keeps its comma.
  return long ? text : text.replace(",", "");
}

function timeText(date: Date, zone: string) {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** " India time" or " London time" when the clocks differ, otherwise "". */
function zoneSuffix(clock: Clock) {
  const other = differentZone();
  if (!other) return "";
  return " " + zoneName(clock === "school" ? SCHOOL_ZONE : other);
}

export function formatWhen(
  value: string | Date | null | undefined,
  style: WhenStyle = "date",
  clock: Clock = "viewer",
) {
  if (!value) return "";
  const { date, zone, timed } = resolve(value, clock);
  if (Number.isNaN(date.getTime())) return "";
  if (style === "date") return dateText(date, zone, false);
  if (style === "day") return dateText(date, zone, true);
  if (style === "long") return dateText(date, zone, true, true);
  if (!timed) return dateText(date, zone, true);
  const time = timeText(date, zone) + zoneSuffix(clock);
  return style === "time" ? time : `${dateText(date, zone, true)} · ${time}`;
}

/** "Sat 10 Oct · 10:00–11:00 am"; a range across days names both days. */
export function formatRange(start: string, end: string, clock: Clock = "viewer") {
  const from = resolve(start, clock);
  const to = resolve(end, clock);
  if (Number.isNaN(from.date.getTime())) return "";
  if (Number.isNaN(to.date.getTime())) return formatWhen(start, "dayTime", clock);
  const day = dateText(from.date, from.zone, true);
  if (day !== dateText(to.date, to.zone, true))
    return `${day} · ${timeText(from.date, from.zone)} – ${formatWhen(end, "dayTime", clock)}`;
  const a = timeText(from.date, from.zone);
  const b = timeText(to.date, to.zone);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${day} · ${sameHalf ? a.slice(0, -3) : a}–${b}${zoneSuffix(clock)}`;
}

/** The school's calendar day for a moment, as YYYY-MM-DD. */
export function schoolDay(value: string | Date = new Date()) {
  return new Date(value).toLocaleDateString("en-CA", { timeZone: SCHOOL_ZONE });
}
