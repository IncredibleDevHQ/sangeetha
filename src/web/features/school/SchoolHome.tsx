import { useEffect, useState } from "react";
import { CalendarDays, ChevronRight } from "lucide-react";
import { navigate } from "../../routes";
import { availableModules } from "./navigation";
import {
  useSchool,
  money,
  num,
  text,
  teacherName,
  type Row,
  type School,
} from "./common";
import { Art } from "../../components/Art";
import { personalName } from "../../../core/account";
import { formatRange, formatWhen } from "../../lib/when";

/** Clay icons for school areas; areas without one keep their line icon. */
const MODULE_ART: Record<string, string> = {
  households: "icon-families",
  roster: "icon-practice",
  schedule: "icon-calendar",
  billing: "icon-fees",
  library: "icon-learn",
  tests: "icon-record",
  events: "icon-events",
  messages: "icon-feedback",
};

function greeting(hour: number) {
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}

const count = (n: number, one: string, many = one + "s") =>
  `${n} ${n === 1 ? one : many}`;

export function SchoolHome({
  school,
  capabilities,
  name,
}: {
  school: School;
  capabilities: string[];
  name: string;
}) {
  const tools = useSchool(school);
  const [reports, setReports] = useState<Record<string, Row[]> | null>(null);
  const [error, setError] = useState("");
  const [schedule, setSchedule] = useState<{
    classes: Row[];
    attendance: Row[];
  } | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const [claims, setClaims] = useState(0);
  const canSchedule = capabilities.includes("schedule.manage");
  const canReport = capabilities.includes("reports.read");
  const finance = capabilities.includes("finance.manage");
  useEffect(() => {
    let active = true;
    setSchedule(null);
    setScheduleError("");
    if (canSchedule)
      tools
        .read<{ classes: Row[]; attendance: Row[] }>("schedule")
        .then((r) => {
          if (active) setSchedule(r);
        })
        .catch((e) => {
          if (active) setScheduleError(e.message);
        });
    return () => {
      active = false;
    };
  }, [tools.read, canSchedule]);
  useEffect(() => {
    let active = true;
    setReports(null);
    setError("");
    if (canReport)
      tools
        .read<Record<string, Row[]>>("reports")
        .then((r) => {
          if (active) setReports(r);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    if (finance)
      tools
        .read<{ payments: Row[] }>("billing")
        .then((r) => {
          if (active)
            setClaims(r.payments.filter((p) => p.status === "claim").length);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [tools.read, canReport, finance]);
  const classes = schedule?.classes || [];
  const nextClass = classes.find(
    (c) =>
      c.status === "scheduled" &&
      new Date(text(c, "ends_at")).getTime() > Date.now(),
  );
  // Classes from the last fortnight that ended with nobody marked.
  const unmarked = classes.filter(
    (c) =>
      c.status !== "cancelled" &&
      new Date(text(c, "ends_at")).getTime() < Date.now() &&
      new Date(text(c, "ends_at")).getTime() > Date.now() - 14 * 86400000 &&
      !schedule?.attendance.some((a) => a.occurrence_id === c.id),
  ).length;
  const modules = availableModules(capabilities);
  const has = (module: string) => modules.some((m) => m.id === module);
  const open = (module: string) => navigate({ page: "operations", module });
  const owing = (reports?.collections || []).filter((r) => num(r, "due") > 0);
  const owed = owing.reduce((n, r) => n + num(r, "due"), 0);
  const toReview = (reports?.learning || []).reduce(
    (n, r) => n + Math.max(0, num(r, "submissions") - num(r, "reviewed")),
    0,
  );
  const followUps = reports?.tasks?.length || 0;
  const undelivered = reports?.failures?.length || 0;
  const needs = [
    {
      label: count(claims, "payment") + " to verify",
      value: claims,
      module: "billing",
    },
    {
      label: `${count(owing.length, "family", "families")} owe ${money(owed)}`,
      value: owing.length,
      module: "billing",
    },
    {
      label: count(unmarked, "class", "classes") + " without attendance",
      value: unmarked,
      module: "schedule",
    },
    {
      label: count(toReview, "recording") + " to review",
      value: toReview,
      module: "tests",
    },
    {
      label: count(followUps, "family follow-up") + " open",
      value: followUps,
      module: "households",
    },
    {
      label: count(undelivered, "message") + " not delivered",
      value: undelivered,
      module: "messages",
    },
  ].filter((x) => x.value > 0 && has(x.module));
  const loadingNeeds =
    (canReport && !reports && !error) ||
    (canSchedule && !schedule && !scheduleError);
  // One line of live status per area, where the school's records say something.
  const status: Record<string, string> = {
    schedule: schedule
      ? nextClass
        ? "Next class " +
          formatWhen(text(nextClass, "starts_at"), "dayTime", "school")
        : "No classes coming up"
      : "",
    billing: reports
      ? owing.length
        ? `${count(owing.length, "family", "families")} owe ${money(owed)}`
        : "Nothing due"
      : "",
    tests: reports
      ? toReview
        ? count(toReview, "recording") + " to review"
        : "No recordings waiting"
      : "",
    households: reports
      ? followUps
        ? count(followUps, "follow-up") + " open"
        : "No open follow-ups"
      : "",
    messages: reports
      ? undelivered
        ? count(undelivered, "message") + " not delivered"
        : "Everything delivered"
      : "",
  };
  const who = personalName(name);
  return (
    <div className="school-home">
      <div className="home-heading">
        <div>
          <span className="eyebrow">{school.name}</span>
          <h1>
            {greeting(new Date().getHours())}
            {who ? `, ${who}` : ""}.
          </h1>
          <p>Make room for the music. Start with what needs you.</p>
        </div>
        <span className="home-date">
          <CalendarDays size={17} aria-hidden="true" />
          {formatWhen(new Date(), "long", "school")}
        </span>
      </div>
      <div className="home-grid">
        <section className="home-focus">
          <span className="eyebrow">
            {canSchedule ? "Up next" : "Your workspace"}
          </span>
          <Art
            name={nextClass ? "tala-ring" : "no-classes"}
            size={220}
            className="focus-art"
          />
          <h2>
            {nextClass
              ? text(nextClass, "batch_name")
              : canSchedule
                ? scheduleError
                  ? "Schedule unavailable"
                  : schedule
                    ? "Your next class starts here."
                    : "Loading your schedule…"
                : "Make room for the music."}
          </h2>
          <p>
            {nextClass
              ? formatRange(
                  text(nextClass, "starts_at"),
                  text(nextClass, "ends_at"),
                  "school",
                )
              : scheduleError
                ? "Open Classes to try again."
                : canSchedule
                  ? "Set up a batch and schedule its first class. Your next class will appear here."
                  : "Open an area to continue your work for the school."}
          </p>
          {nextClass && (
            <p>
              {[
                teacherName(nextClass),
                text(nextClass, "location") || "Location to be confirmed",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <div className="home-focus-actions">
            {canSchedule && (
              <button
                className="button primary"
                onClick={() =>
                  nextClass
                    ? navigate({
                        page: "operations",
                        module: "schedule",
                        class: nextClass.id,
                      })
                    : open("schedule")
                }
              >
                {nextClass ? "Open class" : "Open classes"}
                <ChevronRight size={17} aria-hidden="true" />
              </button>
            )}
            {has("library") && (
              <button
                className="button secondary"
                onClick={() => open("library")}
              >
                Explore curriculum
              </button>
            )}
          </div>
        </section>
        <section className="home-attention">
          <h2>Needs your attention</h2>
          {error ? (
            <p role="alert">We couldn’t load your worklist. {error}</p>
          ) : loadingNeeds ? (
            <p role="status">Loading your worklist…</p>
          ) : needs.length ? (
            needs.map((x) => (
              <button
                className="attention-row"
                key={x.label}
                onClick={() => open(x.module)}
              >
                <span>{x.label}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            ))
          ) : (
            <div className="home-calm art-state">
              <Art name="all-caught-up" size={96} />
              <div>
                <h3>That’s everything for now</h3>
                <p>
                  Payments to verify, fees owed, classes without attendance and
                  recordings to review will appear here.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
      <section className="home-areas" aria-labelledby="home-areas-title">
        <h2 id="home-areas-title">Your school today</h2>
        <ul>
          {modules
            .filter((m) => m.group !== "Workspace")
            .map((m) => (
              <li key={m.id}>
                <button className="area-row" onClick={() => open(m.id)}>
                  <span className="area-icon">
                    {MODULE_ART[m.id] ? (
                      <img
                        className="tulsi-art"
                        src={`/art/${MODULE_ART[m.id]}.svg`}
                        width={36}
                        height={36}
                        alt=""
                      />
                    ) : (
                      <m.icon size={20} aria-hidden="true" />
                    )}
                  </span>
                  <span className="area-text">
                    <strong>{m.name}</strong>
                    <small>{status[m.id] || m.summary}</small>
                  </span>
                  <ChevronRight size={17} aria-hidden="true" />
                </button>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
