import { useEffect, useRef, useState } from "react";
import {
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  Download,
  ListChecks,
  MessageCircle,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { csvExport } from "../../../core/csv";
import { navigate, useRouteValue } from "../../routes";
import { BackLink } from "../../components/ui";
import { PageActions, focusPageHeading } from "../../components/PageHeader";
import { formatWhen } from "../../lib/when";
import { text, num, money, type Row, type SchoolTools } from "./common";

const reports = [
  {
    id: "attendance",
    title: "Attendance",
    description: "See who is attending and where a check-in may help.",
    icon: CalendarCheck,
    empty: "Attendance will appear here once learners join the school.",
    columns: ["Learner", "Present", "Marked", "Attendance"],
  },
  {
    id: "learning",
    title: "Learning & reviews",
    description: "Follow recording submissions through to published feedback.",
    icon: ClipboardCheck,
    empty: "Learning records will appear here once learners join the school.",
    columns: [
      "Learner",
      "Attempts sent",
      "Published reviews",
      "Awaiting publication",
    ],
  },
  {
    id: "collections",
    title: "Outstanding fees",
    description: "Review unpaid charges and open the family's statement.",
    icon: Wallet,
    empty:
      "No outstanding charges. Verified payments and adjustments are reflected here.",
    columns: [
      "Household",
      "Learner / charge",
      "Description",
      "Due date",
      "Outstanding",
    ],
  },
  {
    id: "tasks",
    title: "Family follow-ups",
    description: "Keep open office tasks connected to each household.",
    icon: ListChecks,
    empty:
      "No open follow-ups. Add a task from a household when a family needs a check-in.",
    columns: ["Household", "Task", "Due date", "Timing"],
  },
  {
    id: "failures",
    title: "Message issues",
    description: "Find failed messages and outcomes that need reconciliation.",
    icon: MessageCircle,
    empty: "No failed or uncertain messages in the current records.",
    columns: ["Recipient", "Message type", "Status", "Reason"],
  },
] as const;
type ReportId = (typeof reports)[number]["id"];
type ReportData = Record<ReportId, Row[]>;
const dateText = (value: string) => {
  const day = value.slice(0, 10);
  return day ? formatWhen(day, "date") : "No due date";
};
const timing = (row: Row) => {
  const due = text(row, "due_on").slice(0, 10);
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Kolkata",
  });
  return !due
    ? "Unscheduled"
    : due < today
      ? "Overdue"
      : due === today
        ? "Due today"
        : "Upcoming";
};
const messageTypes: Record<string, string> = {
  class: "Class reminder",
  fee: "Fee reminder",
  test: "Test reminder",
  feedback: "Scorecard",
  event: "Event reminder",
  announcement: "Announcement",
};
function values(id: ReportId, row: Row): (string | number)[] {
  if (id === "attendance")
    return [
      text(row, "name"),
      num(row, "present"),
      num(row, "marked"),
      num(row, "marked")
        ? Math.round((num(row, "present") / num(row, "marked")) * 100) + "%"
        : "Not marked",
    ];
  if (id === "learning")
    return [
      text(row, "name"),
      num(row, "submissions"),
      num(row, "reviewed"),
      Math.max(0, num(row, "submissions") - num(row, "reviewed")),
    ];
  if (id === "collections")
    return [
      text(row, "household_name") || "Household",
      text(row, "learner_name") || "Household contribution",
      text(row, "description"),
      dateText(text(row, "due_on")),
      money(num(row, "due")),
    ];
  if (id === "tasks")
    return [
      text(row, "household"),
      text(row, "title"),
      dateText(text(row, "due_on")),
      timing(row),
    ];
  return [
    text(row, "destination"),
    messageTypes[text(row, "kind")] || text(row, "kind"),
    row.status === "unknown" ? "Needs reconciliation" : "Failed",
    text(row, "error") || "No reason recorded",
  ];
}

export function ReportsView({
  tools,
  capabilities,
}: {
  tools: SchoolTools;
  capabilities: string[];
}) {
  const [data, setData] = useState<ReportData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [updated, setUpdated] = useState<Date | null>(null);
  const [report] = useRouteValue("report"),
    [query, setQuery] = useRouteValue("q"),
    [sort, setSort] = useRouteValue("sort", "default");
  const request = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  async function load() {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const result = await tools.read<ReportData>("reports");
      if (id === request.current) {
        setData(result);
        setUpdated(new Date());
      }
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    } finally {
      if (id === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [tools.read]);
  useEffect(() => {
    if (loading) return;
    if (heading.current) heading.current.focus();
    else focusPageHeading();
  }, [report, loading]);
  const available = reports.filter(
    (r) => r.id !== "collections" || capabilities.includes("finance.manage"),
  );
  const current = available.find((r) => r.id === report);
  if (!data && loading)
    return (
      <p className="ui-empty" role="status">
        Preparing your school reports…
      </p>
    );
  if (error)
    return (
      <div className="ui-empty" role="alert">
        <h2>We couldn’t refresh your reports</h2>
        <p>{error}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );
  if (!data) return null;
  if (report && !current)
    return (
      <div className="ui-empty">
        <h2>Report unavailable</h2>
        <p>Choose one of the reports available to your account.</p>
        <button onClick={() => navigate({ report: "", q: "", sort: "" })}>
          All reports
        </button>
      </div>
    );
  const outstanding = data.collections.filter((r) => num(r, "due") > 0);
  const totalDue = outstanding.reduce((n, r) => n + num(r, "due"), 0);
  const present = data.attendance.reduce((n, r) => n + num(r, "present"), 0);
  const marked = data.attendance.reduce((n, r) => n + num(r, "marked"), 0);
  const submissions = data.learning.reduce(
    (n, r) => n + num(r, "submissions"),
    0,
  );
  const published = data.learning.reduce((n, r) => n + num(r, "reviewed"), 0);
  const rows = current
    ? current.id === "collections"
      ? outstanding
      : data[current.id]
    : [];
  const shown = current
    ? rows.filter((r) =>
        values(current.id, r)
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      )
    : [];
  if (current && sort === "name")
    shown.sort((a, b) =>
      String(values(current.id, a)[0]).localeCompare(
        String(values(current.id, b)[0]),
      ),
    );
  if (current && sort === "priority")
    shown.sort((a, b) =>
      current.id === "collections"
        ? num(b, "due") - num(a, "due")
        : current.id === "learning"
          ? num(b, "submissions") -
            num(b, "reviewed") -
            (num(a, "submissions") - num(a, "reviewed"))
          : current.id === "attendance"
            ? (num(a, "marked") ? num(a, "present") / num(a, "marked") : 2) -
              (num(b, "marked") ? num(b, "present") / num(b, "marked") : 2)
            : text(a, "due_on").localeCompare(text(b, "due_on")),
    );
  const metric = (id: ReportId) =>
    id === "attendance"
      ? marked
        ? `${Math.round((present / marked) * 100)}%`
        : "Not marked"
      : id === "learning"
        ? `${Math.max(0, submissions - published)}`
        : id === "collections"
          ? money(totalDue)
          : String(data[id].length);
  const context = (id: ReportId) =>
    id === "attendance"
      ? `${present} present / ${marked} marked records`
      : id === "learning"
        ? `attempts waiting for feedback · ${published} published`
        : id === "collections"
          ? `${outstanding.length} unpaid ${outstanding.length === 1 ? "charge" : "charges"} · INR`
          : id === "tasks"
            ? "open household tasks"
            : "failed or uncertain outcomes";
  const rowAction = (
    id: ReportId,
    row: Row,
  ): { label: string; route: Record<string, string> } | null => {
    if (id === "collections" && capabilities.includes("finance.manage"))
      return {
        label: "Open statement",
        route: { module: "billing", household: text(row, "household_id") },
      };
    if (id === "tasks" && capabilities.includes("crm.manage"))
      return {
        label: "Open household",
        route: {
          module: "households",
          household: text(row, "household_id"),
          section: "work",
        },
      };
    if (id === "failures" && capabilities.includes("communicate.manage"))
      return {
        label: "Review message",
        route: { module: "messages", message: row.id },
      };
    if (id === "learning" && capabilities.includes("assessments.manage"))
      return {
        label: "Open reviews",
        route: { module: "tests", q: text(row, "name"), queue: "all" },
      };
    return null;
  };
  const hasActions =
    !!current && shown.some((row) => rowAction(current.id, row));
  const explanation =
    current?.id === "attendance"
      ? "Present ÷ marked attendance records. Absent, late and excused marks remain in the denominator; unmarked classes are excluded. This is not a scheduled-class completion rate."
      : current?.id === "learning"
        ? "Counts every attempt, including resubmissions. Reviewed means feedback is published; saved drafts still wait for publication."
        : current?.id === "collections"
          ? "Only positive charge balances are shown, after allocations and adjustments. Includes tuition and event charges, whether or not their due date has passed. Unallocated credit is shown in the household statement."
          : current?.id === "tasks"
            ? "Open follow-ups only. Due dates are compared with today's date in India, the school's current scheduling time zone."
            : "Failed and uncertain delivery outcomes only. Confirm the provider's result before retrying an uncertain message.";
  return (
    <section className="reports-workspace" aria-busy={loading}>
      <PageActions>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </PageActions>
      {current && (
        <>
          <BackLink onClick={() => navigate({ report: "", q: "", sort: "" })}>
            All reports
          </BackLink>
          <div className="report-heading">
            <div>
              <h2 ref={heading} tabIndex={-1}>
                {current.title}
              </h2>
              <p>{current.description}</p>
            </div>
          </div>
        </>
      )}
      <p className="report-freshness" role="status">
        All recorded history ·{" "}
        {loading
          ? "Refreshing records…"
          : `Updated ${formatWhen(updated, "time")}`}
      </p>
      {!current ? (
        <div className="report-directory">
          {available.map(({ id, title, description, icon: Icon }) => (
            <button
              key={id}
              className="report-card"
              onClick={() => navigate({ report: id, q: "", sort: "" })}
            >
              <span className="report-card-top">
                <span className="report-icon">
                  <Icon size={20} />
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </span>
              <h3>{title}</h3>
              <strong className="report-metric">{metric(id)}</strong>
              <span className="report-card-context">{context(id)}</span>
              <p>{description}</p>
              <span className="report-card-link">
                Explore report <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="report-summary">
            <div>
              <strong>{metric(current.id)}</strong>
              <span>{context(current.id)}</span>
            </div>
            <p>{explanation}</p>
          </div>
          <div className="report-toolbar">
            <label className="report-search">
              <Search size={17} />
              <input
                type="search"
                aria-label={`Search ${current.title.toLowerCase()}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search this report"
              />
            </label>
            <label className="report-sort">
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="default">Report order</option>
                <option value="name">Name / recipient</option>
                {current.id !== "failures" && (
                  <option value="priority">
                    {current.id === "attendance"
                      ? "Lowest attendance first"
                      : current.id === "learning"
                        ? "Most awaiting publication"
                        : current.id === "collections"
                          ? "Highest balance first"
                          : "Due date"}
                  </option>
                )}
              </select>
            </label>
            <button
              className="button secondary"
              disabled={!shown.length || loading}
              onClick={() =>
                tools.download(
                  `${current.id}.csv`,
                  csvExport([
                    [...current.columns],
                    ...shown.map((r) => values(current.id, r)),
                  ]),
                )
              }
            >
              <Download size={15} /> Export shown rows
            </button>
          </div>
          <p className="report-count" role="status">
            {shown.length} of {rows.length}{" "}
            {current.id === "attendance" || current.id === "learning"
              ? "learners"
              : "records"}
            {query.trim() ? " match your search" : ""}
          </p>
          {!shown.length ? (
            <div className="ui-empty">
              <h3>
                {query.trim() ? "No matching records" : "Nothing to report yet"}
              </h3>
              <p>
                {query.trim()
                  ? "Try another name or clear the search to see all records."
                  : current.empty}
              </p>
              {query.trim() && (
                <button onClick={() => setQuery("")}>Clear search</button>
              )}
            </div>
          ) : (
            <div className="report-results">
              <table>
                <caption className="sr-only">
                  {current.title} — shown records
                </caption>
                <thead>
                  <tr>
                    {current.columns.map((label) => (
                      <th key={label} scope="col">
                        {label}
                      </th>
                    ))}
                    {hasActions && (
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((row) => {
                    const cells = values(current.id, row),
                      action = rowAction(current.id, row);
                    return (
                      <tr key={row.id}>
                        {cells.map((value, index) => (
                          <td key={index} data-label={current.columns[index]}>
                            {index === 0 ? <strong>{value}</strong> : value}
                          </td>
                        ))}
                        {hasActions && (
                          <td className="report-row-action">
                            {action && (
                              <button
                                aria-label={`${action.label}: ${cells[0]}`}
                                onClick={() => navigate(action.route)}
                              >
                                {action.label}
                                <ChevronRight size={14} aria-hidden="true" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
