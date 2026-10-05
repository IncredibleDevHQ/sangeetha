import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, Music2 } from "lucide-react";
import { navigate } from "../../routes";
import { availableModules } from "./navigation";
import { useSchool, money, num, text, type Row, type School } from "./common";
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
  const [classes, setClasses] = useState<Row[] | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const canSchedule = capabilities.includes("schedule.manage");
  useEffect(() => {
    let active = true;
    setClasses(null);
    setScheduleError("");
    if (canSchedule)
      tools
        .read<{ classes: Row[] }>("schedule")
        .then((r) => {
          if (active) setClasses(r.classes);
        })
        .catch((e) => {
          if (active) setScheduleError(e.message);
        });
    return () => {
      active = false;
    };
  }, [tools.read, canSchedule]);
  const nextClass = classes?.find(
    (c) =>
      c.status === "scheduled" &&
      new Date(text(c, "ends_at")).getTime() > Date.now(),
  );
  const canReport = capabilities.includes("reports.read");
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
    return () => {
      active = false;
    };
  }, [tools.read, canReport]);
  const modules = availableModules(capabilities);
  const open = (module: string) => navigate({ page: "operations", module });
  const needs = reports
    ? [
        {
          label: "Open family follow-ups",
          value: reports.tasks?.length || 0,
          module: "households",
        },
        {
          label: "Recordings awaiting published feedback",
          value: (reports.learning || []).reduce(
            (n, r) =>
              n + Math.max(0, num(r, "submissions") - num(r, "reviewed")),
            0,
          ),
          module: "tests",
        },
        {
          label: "Messages needing attention",
          value: reports.failures?.length || 0,
          module: "messages",
        },
      ].filter((x) => modules.some((m) => m.id === x.module))
    : [];
  return (
    <div className="school-home">
      <div className="home-heading">
        <div>
          <span className="eyebrow">Your school at a glance</span>
          <h1>
            Hello, {name === "Music Teacher" ? "teacher" : name.split(" ")[0]}.
          </h1>
          <p>Make room for the music. Start with what needs you.</p>
        </div>
        <span className="home-date">
          <CalendarDays size={17} />
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>
      <div className="home-grid">
        <section className="home-focus">
          <span className="eyebrow">
            {canSchedule ? "Up next" : "Your workspace"}
          </span>
          <Music2 size={36} className="focus-symbol" />
          <h2>
            {nextClass
              ? text(nextClass, "batch_name")
              : canSchedule
                ? scheduleError
                  ? "Schedule unavailable"
                  : classes
                    ? "Your next class starts here."
                    : "Loading your schedule…"
                : "Make space for learning."}
          </h2>
          <p>
            {nextClass
              ? new Date(text(nextClass, "starts_at")).toLocaleString(
                  undefined,
                  {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  },
                )
              : scheduleError
                ? "Open Classes to try again."
                : canSchedule
                  ? "Set up a batch and schedule its first session. Your next class will appear here."
                  : "Open an area below to continue your work for the school."}
          </p>
          {nextClass && (
            <p>
              {text(nextClass, "teacher")} ·{" "}
              {text(nextClass, "location") || "Location to be confirmed"}
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
                {nextClass ? "Open class" : "Open classes"}{" "}
                <ArrowUpRight size={17} />
              </button>
            )}
            {modules.some((m) => m.id === "library") && (
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
          <div className="section-heading">
            <h2>Needs your attention</h2>
            <span className="home-live">School records</span>
          </div>
          {error ? (
            <p role="alert">We couldn’t load your worklist. {error}</p>
          ) : canReport && !reports ? (
            <p role="status">Loading your worklist…</p>
          ) : needs.some((x) => x.value > 0) ? (
            needs
              .filter((x) => x.value > 0)
              .map((x) => (
                <button
                  className="attention-row"
                  key={x.module}
                  onClick={() => open(x.module)}
                >
                  <span>{x.label}</span>
                  <strong>{x.value}</strong>
                  <ArrowUpRight size={16} />
                </button>
              ))
          ) : (
            <div className="home-calm">
              <span>
                <Check size={22} />
              </span>
              <h3>
                {canReport
                  ? "Nothing waiting in this worklist"
                  : "Your workspace is ready"}
              </h3>
              <p>
                {canReport
                  ? "Open follow-ups, unpublished reviews and message failures will appear here."
                  : "Choose an area below to continue your work."}
              </p>
            </div>
          )}
          {reports && capabilities.includes("finance.manage") && (
            <button className="home-balance" onClick={() => open("billing")}>
              <span>Outstanding fees</span>
              <strong>
                {money(
                  (reports.collections || []).reduce(
                    (n, r) => n + num(r, "due"),
                    0,
                  ),
                )}
              </strong>
              <ArrowUpRight size={16} />
            </button>
          )}
        </section>
      </div>
      <div className="section-heading">
        <h2>Continue in your school</h2>
        <span className="fine">Your available workspaces</span>
      </div>
      <div className="home-destinations">
        {modules
          .filter((m) => m.group !== "Workspace")
          .map((m) => (
            <button
              className="destination-card"
              key={m.id}
              onClick={() => open(m.id)}
            >
              <span className="destination-icon">
                <m.icon size={21} />
              </span>
              <ArrowUpRight className="destination-arrow" size={17} />
              <h3>{m.name}</h3>
              <p>{m.description}</p>
            </button>
          ))}
      </div>
    </div>
  );
}
