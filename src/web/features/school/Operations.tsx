import { WorkflowForm } from "../../components/WorkflowForm";
import { useRouteValue, navigate } from "../../routes";
import {
  ChevronRight,
  MapPin,
  Plus,
  Users,
  Wallet,
  Search,
} from "lucide-react";
import {
  Badge,
  BackLink,
  Initials,
  StatusPill,
  paymentMethod,
  statusLabel,
} from "../../components/ui";
import { EmptyArt } from "../../components/Art";
import {
  WorkflowDetails,
  WorkflowPanel,
  openWorkflow,
} from "../../components/WorkflowDetails";
import { MoreMenu, PageActions } from "../../components/PageHeader";
import { formatRange, formatWhen, schoolDay } from "../../lib/when";
import { AttendanceSheet } from "./AttendanceSheet";
import { useEffect, useRef, useState } from "react";
import {
  text,
  num,
  today,
  money,
  Select,
  teacherName,
  type Row,
  type SchoolTools,
} from "./common";
import { type Roster } from "./Roster";
export { RosterView, type Roster } from "./Roster";
const localInput = (v: string) =>
  new Date(v)
    .toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" })
    .replace(" ", "T")
    .slice(0, 16);
export function ScheduleView({ tools: t }: { tools: SchoolTools }) {
  const [data, setData] = useState<{ classes: Row[]; attendance: Row[] }>({
      classes: [],
      attendance: [],
    }),
    [roster, setRoster] = useState<Roster>({
      learners: [],
      batches: [],
      enrollments: [],
      staff: [],
    }),
    [selected, setSelected] = useState<Row | null>(null),
    [batch, setBatch] = useRouteValue("batch"),
    [teacher, setTeacher] = useState(""),
    [range, setRange] = useRouteValue("range", "week"),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState("");
  const requestId = useRef(0);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  async function load() {
    const request = ++requestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const [schedule, people] = await Promise.all([
        t.read<{ classes: Row[]; attendance: Row[] }>("schedule"),
        t.read<Roster>("roster"),
      ]);
      if (request === requestId.current) {
        setData(schedule);
        setRoster(people);
      }
    } catch (error) {
      if (request === requestId.current) setLoadError((error as Error).message);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      requestId.current++;
    };
  }, [t.read]);
  const [classId] = useRouteValue("class");
  useEffect(() => {
    setSelected(data.classes.find((c) => c.id === classId) || null);
  }, [classId, data]);
  useEffect(() => {
    if (selected) detailHeading.current?.focus();
  }, [selected?.id]);
  const enrolled = selected
    ? roster.enrollments.filter(
        (e) =>
          e.batch_id === selected.batch_id &&
          text(e, "starts_on").slice(0, 10) <=
            schoolDay(text(selected, "starts_at")) &&
          (!e.ends_on ||
            text(e, "ends_on").slice(0, 10) >=
              schoolDay(text(selected, "starts_at"))),
      )
    : [];
  const currentDay = schoolDay();
  const weekOf = (day: string) => {
    const date = new Date(day + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  };
  const thisWeek = weekOf(currentDay);
  const dayOf = (c: Row) => schoolDay(text(c, "starts_at"));
  const visibleClasses = [...data.classes]
    .filter((c) =>
      range === "today"
        ? dayOf(c) === currentDay
        : range === "week"
          ? weekOf(dayOf(c)) === thisWeek
          : range === "upcoming"
            ? new Date(text(c, "ends_at")) >= new Date() &&
              c.status !== "cancelled"
            : true,
    )
    .sort((a, b) => text(a, "starts_at").localeCompare(text(b, "starts_at")));
  const weeks = [...new Set(visibleClasses.map((c) => weekOf(dayOf(c))))];
  const weekTitle = (week: string) => {
    const days = Math.round(
      (Date.parse(week) - Date.parse(thisWeek)) / 86400000,
    );
    return days === 0
      ? "This week"
      : days === 7
        ? "Next week"
        : days === -7
          ? "Last week"
          : "Week of " + formatWhen(week, "date");
  };
  const back = () => navigate({ class: "", action: "", form: "" });
  const learnerName = (id: unknown) =>
    text(roster.learners.find((l) => l.id === id) || {}, "name");
  return (
    <>
      {!classId && (
        <PageActions>
          <button
            className="button primary"
            onClick={() => openWorkflow("Schedule classes")}
          >
            <Plus size={16} aria-hidden="true" /> Schedule classes
          </button>
        </PageActions>
      )}
      <div hidden={Boolean(classId)}>
        <WorkflowPanel
          title="Schedule classes"
          description="Times are India time. A class can repeat weekly for up to a year."
        >
          <WorkflowForm
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const result = await t.command<{ id?: string }>("class.create", {
                batch,
                teacher,
                starts: new Date(
                  String(f.get("starts")) + "+05:30",
                ).toISOString(),
                ends: new Date(String(f.get("ends")) + "+05:30").toISOString(),
                location: f.get("location"),
                repeatWeeks: Number(f.get("weeks")),
                makeupFor: f.get("makeup") || undefined,
              });
              if (result !== undefined) {
                navigate({ action: "", form: "", range: "upcoming" });
                await load();
              }
            }}
          >
            <Select
              label="Batch"
              value={batch}
              onChange={setBatch}
              rows={roster.batches}
            />
            <Select
              label="Teacher"
              value={teacher}
              onChange={setTeacher}
              rows={roster.staff}
              labelKey="display_name"
            />
            <label>
              Starts
              <input name="starts" required type="datetime-local" />
            </label>
            <label>
              Ends
              <input name="ends" required type="datetime-local" />
            </label>
            <label>
              Meeting link or location
              <input name="location" placeholder="Studio / Meet link" />
            </label>
            <label>
              Repeat weekly for
              <input
                name="weeks"
                type="number"
                min="1"
                max="52"
                defaultValue="1"
              />
            </label>
            <label>
              Make-up for (optional)
              <select name="makeup">
                <option value="">None</option>
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {text(c, "batch_name")} ·{" "}
                    {formatWhen(text(c, "starts_at"), "dayTime", "school")}
                  </option>
                ))}
              </select>
            </label>
            <button className="button primary" disabled={t.busy}>
              Schedule
            </button>
          </WorkflowForm>
        </WorkflowPanel>
        <div className="agenda-toolbar">
          <h2>Class calendar</h2>
          <div className="view-switch" aria-label="Classes to show">
            {[
              ["today", "Today"],
              ["week", "This week"],
              ["upcoming", "Upcoming"],
              ["all", "All"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={range === value}
                onClick={() => setRange(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <p className="ui-empty" role="status">
            Loading your classes…
          </p>
        ) : loadError ? (
          <div className="ui-empty" role="alert">
            <h3>We couldn’t load the calendar</h3>
            <p>{loadError}</p>
            <button onClick={() => void load()}>Try again</button>
          </div>
        ) : !visibleClasses.length ? (
          <div className="schedule-empty">
            <EmptyArt name="no-classes" />
            <h3>
              {data.classes.length
                ? range === "today"
                  ? "No classes today"
                  : range === "week"
                    ? "No classes this week"
                    : "No upcoming classes"
                : "Make room for your first class"}
            </h3>
            <p>
              {data.classes.length
                ? "See what’s coming up, or schedule your next lesson."
                : "Choose a batch, a teacher and a time. You can repeat a class each week."}
            </p>
            <button
              className="button primary"
              onClick={() => openWorkflow("Schedule classes")}
            >
              Schedule classes
            </button>
            {data.classes.length > 0 && range !== "upcoming" && (
              <button
                className="text-button"
                onClick={() => setRange("upcoming")}
              >
                Show upcoming classes
              </button>
            )}
          </div>
        ) : (
          <div className="calendar">
            {weeks.map((week) => (
              <section className="calendar-week" key={week}>
                <h3>{weekTitle(week)}</h3>
                <ul>
                  {visibleClasses
                    .filter((c) => weekOf(dayOf(c)) === week)
                    .map((c) => (
                      <li key={c.id}>
                        <button
                          className={`calendar-row ${dayOf(c) === currentDay ? "is-today" : ""}`}
                          onClick={() =>
                            navigate({ class: c.id, action: "", form: "" })
                          }
                        >
                          <span className="calendar-day">
                            {dayOf(c) === currentDay
                              ? "Today"
                              : formatWhen(dayOf(c), "day")}
                          </span>
                          <span className="calendar-time">
                            {formatRange(
                              text(c, "starts_at"),
                              text(c, "ends_at"),
                              "school",
                            ).split(" · ")[1] || ""}
                          </span>
                          <span className="calendar-class">
                            <strong>{text(c, "batch_name")}</strong>
                            <small>
                              {teacherName(c) || "Teacher to be assigned"} ·{" "}
                              {text(c, "location") || "Location to be confirmed"}
                            </small>
                          </span>
                          <StatusPill
                            status={text(c, "status")}
                            usual="scheduled"
                          />
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      {classId && !selected && (
        <div className="ui-empty">
          <BackLink onClick={back}>All classes</BackLink>
          <h3>
            {loading
              ? "Loading class…"
              : loadError
                ? "We couldn’t load this class"
                : "Class unavailable"}
          </h3>
          <p>
            {loadError ||
              (!loading &&
                "This class may no longer be available to your account.")}
          </p>
          {loadError && <button onClick={() => void load()}>Try again</button>}
        </div>
      )}
      {selected && (
        <section className="class-record" key={selected.id}>
          <BackLink onClick={back}>All classes</BackLink>
          <div className="class-record-header">
            <div>
              <h2 ref={detailHeading} tabIndex={-1}>
                {text(selected, "batch_name")}
              </h2>
              <p>
                {formatRange(
                  text(selected, "starts_at"),
                  text(selected, "ends_at"),
                  "school",
                )}
              </p>
            </div>
            <div className="class-record-actions">
              <StatusPill status={text(selected, "status")} usual="scheduled" />
              <button
                className="button secondary"
                onClick={() => openWorkflow("Edit class")}
              >
                Edit class
              </button>
            </div>
          </div>
          <div className="class-context">
            <span>
              <Users size={17} aria-hidden="true" />
              {teacherName(selected) || "Teacher to be assigned"}
            </span>
            <span>
              <MapPin size={17} aria-hidden="true" />
              {text(selected, "location") || "Location to be confirmed"}
            </span>
          </div>
          <WorkflowPanel
            title="Edit class"
            description="Only this class changes. Reminders already queued for it are cancelled."
          >
            <WorkflowForm
              className="form-grid"
              key={String(selected.version) + selected.id}
              onSubmit={async (e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const r = await t.command("class.update", {
                  id: selected.id,
                  version: selected.version,
                  starts: new Date(
                    String(f.get("starts")) + "+05:30",
                  ).toISOString(),
                  ends: new Date(
                    String(f.get("ends")) + "+05:30",
                  ).toISOString(),
                  teacher: f.get("teacher"),
                  location: f.get("location"),
                  status: f.get("status"),
                });
                if (r) {
                  navigate({ action: "", form: "" });
                  await load();
                }
              }}
            >
              <label>
                Starts
                <input
                  type="datetime-local"
                  name="starts"
                  defaultValue={localInput(text(selected, "starts_at"))}
                />
              </label>
              <label>
                Ends
                <input
                  type="datetime-local"
                  name="ends"
                  defaultValue={localInput(text(selected, "ends_at"))}
                />
              </label>
              <label>
                Teacher or substitute
                <select
                  name="teacher"
                  defaultValue={text(selected, "teacher_id")}
                >
                  {roster.staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {text(s, "display_name")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Location
                <input
                  name="location"
                  defaultValue={text(selected, "location")}
                />
              </label>
              <label>
                Status
                <select name="status" defaultValue={text(selected, "status")}>
                  <option value="scheduled">Scheduled</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <button className="button primary" disabled={t.busy}>
                Save changes
              </button>
            </WorkflowForm>
          </WorkflowPanel>
          <AttendanceSheet
            key={selected.id + ":" + data.attendance.length}
            tools={t}
            occurrence={selected.id}
            cancelled={selected.status === "cancelled"}
            learners={enrolled.map((e) => ({
              id: text(e, "learner_id"),
              name: learnerName(e.learner_id),
            }))}
            saved={Object.fromEntries(
              data.attendance
                .filter((a) => a.occurrence_id === selected.id)
                .map((a) => [text(a, "learner_id"), text(a, "status")]),
            )}
            notes={text(selected, "notes")}
            onSaved={load}
          />
        </section>
      )}
    </>
  );
}
export function BillingView({ tools: t }: { tools: SchoolTools }) {
  const [data, setData] = useState<{
      charges: Row[];
      payments: Row[];
      plans: Row[];
    }>({ charges: [], payments: [], plans: [] }),
    [households, setHouseholds] = useState<Row[]>([]),
    [roster, setRoster] = useState<Roster>({
      learners: [],
      batches: [],
      enrollments: [],
      staff: [],
    }),
    [household, setHousehold] = useRouteValue("household"),
    [statement, setStatement] = useState<{
      charges: Row[];
      payments: Row[];
      allocations: Row[];
      entries: Row[];
    } | null>(null),
    [payment, setPayment] = useRouteValue("payment"),
    [amounts, setAmounts] = useState<Record<string, string>>({}),
    [chargeKey, setChargeKey] = useState(crypto.randomUUID()),
    [paymentKey, setPaymentKey] = useState(crypto.randomUUID()),
    [allocationKey, setAllocationKey] = useState(crypto.randomUUID()),
    [query] = useRouteValue("q"),
    [filter, setFilter] = useRouteValue("balance", "all"),
    [loading, setLoading] = useState(true),
    [loadError, setLoadError] = useState(""),
    [statementFor, setStatementFor] = useState(""),
    [correctionKind, setCorrectionKind] = useState("adjustment");
  const requestId = useRef(0);
  const currentHousehold = useRef(household);
  currentHousehold.current = household;
  const heading = useRef<HTMLHeadingElement>(null);
  async function load() {
    if (household !== currentHousehold.current) return;
    const request = ++requestId.current;
    setLoading(true);
    setLoadError("");
    try {
      const [billing, meta, detail] = await Promise.all([
        t.read<typeof data>("billing"),
        t.read<Roster & { households: Row[] }>("billing-metadata"),
        household
          ? t.read<NonNullable<typeof statement>>(
              "statement",
              "?id=" + encodeURIComponent(household),
            )
          : Promise.resolve(null),
      ]);
      if (
        request === requestId.current &&
        household === currentHousehold.current
      ) {
        setData(billing);
        setHouseholds(meta.households);
        setRoster(meta);
        setStatement(detail);
        setStatementFor(household);
      }
    } catch (error) {
      if (request === requestId.current) setLoadError((error as Error).message);
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }
  useEffect(() => {
    setAmounts({});
    void load();
    return () => {
      requestId.current++;
    };
  }, [t.read, household]);
  useEffect(() => {
    heading.current?.focus();
  }, [statementFor]);
  const due = data.charges.reduce((n, c) => n + num(c, "due"), 0);
  const householdName = text(
    households.find((h) => h.id === household) || {},
    "name",
  );
  const selectedPayment =
    statementFor === household
      ? statement?.payments.find(
          (p) => p.id === payment && p.status === "verified",
        )
      : undefined;
  const allocationTotal = Object.values(amounts).reduce(
    (sum, value) => sum + Math.round(Number(value || 0) * 100),
    0,
  );
  const availableCredit = selectedPayment ? num(selectedPayment, "credit") : 0;
  const balances = households
    .map((h) => ({
      ...h,
      due: data.charges
        .filter((c) => c.household_id === h.id)
        .reduce((sum, c) => sum + num(c, "due"), 0),
      claims: data.payments.filter(
        (p) => p.household_id === h.id && p.status === "claim",
      ).length,
      charges: data.charges.filter((c) => c.household_id === h.id).length,
    }))
    .filter(
      (h) =>
        text(h, "name").toLowerCase().includes(query.toLowerCase()) &&
        (filter === "due"
          ? h.due > 0
          : filter === "claims"
            ? h.claims > 0
            : true),
    )
    .sort(
      (a, b) =>
        b.claims - a.claims ||
        b.due - a.due ||
        text(a, "name").localeCompare(text(b, "name")),
    );
  const back = () =>
    navigate({ household: "", payment: "", action: "", form: "" });
  return (
    <>
      <PageActions>
        <MoreMenu
          items={[
            {
              label: "Fee plans and monthly billing",
              onSelect: () => openWorkflow("Fee plans"),
            },
          ]}
        />
        <button
          className="button primary"
          onClick={() => openWorkflow("Create a charge")}
        >
          <Plus size={16} aria-hidden="true" /> Create a charge
        </button>
      </PageActions>
      <WorkflowPanel
        title="Create a charge"
        description="Bill a household, or one learner in it. The family sees it on their statement."
      >
        <WorkflowForm
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              r = await t.command("billing.charge", {
                household: f.get("household"),
                learner: f.get("learner") || undefined,
                description: f.get("description"),
                amount: Math.round(Number(f.get("amount")) * 100),
                due: f.get("due"),
                key: chargeKey,
              });
            if (r) {
              setChargeKey(crypto.randomUUID());
              navigate({ action: "", form: "" });
            }
            await load();
          }}
        >
          <label>
            Household
            <select
              required
              name="household"
              key={household}
              defaultValue={household}
            >
              <option value="">Choose…</option>
              {households.map((h) => (
                <option value={h.id} key={h.id}>
                  {text(h, "name")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Learner
            <select name="learner">
              <option value="">Household charge</option>
              {roster.learners.map((l) => (
                <option value={l.id} key={l.id}>
                  {text(l, "name")}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <input
              required
              name="description"
              placeholder="October tuition"
            />
          </label>
          <label>
            Amount · INR
            <input
              required
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
            />
          </label>
          <label>
            Due date
            <input required name="due" type="date" defaultValue={today()} />
          </label>
          <button className="button primary" disabled={t.busy}>
            Create charge
          </button>
        </WorkflowForm>
      </WorkflowPanel>
      <WorkflowPanel
        title="Fee plans"
        description="Set a monthly fee for an enrolment, then generate a month’s charges in one step."
      >
        <WorkflowForm
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await t.command("billing.plan", {
              enrollment: f.get("enrollment"),
              amount: Math.round(Number(f.get("amount")) * 100),
              concession: Math.round(Number(f.get("concession")) * 100),
              dueDay: Number(f.get("day")),
            });
            await load();
          }}
        >
          <label>
            Enrolment
            <select required name="enrollment">
              <option value="">Choose…</option>
              {roster.enrollments.map((e) => (
                <option value={e.id} key={e.id}>
                  {text(
                    roster.learners.find((l) => l.id === e.learner_id) ||
                      {},
                    "name",
                  )}{" "}
                  ·{" "}
                  {text(
                    roster.batches.find((b) => b.id === e.batch_id) || {},
                    "name",
                  )}
                </option>
              ))}
            </select>
          </label>
          <label>
            Monthly fee · INR
            <input
              required
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
            />
          </label>
          <label>
            Concession · INR
            <input
              name="concession"
              type="number"
              min="0"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label>
            Due day (1–28)
            <input
              name="day"
              type="number"
              min="1"
              max="28"
              defaultValue="10"
            />
          </label>
          <button className="button primary" disabled={t.busy}>
            Save fee plan
          </button>
        </WorkflowForm>
        <WorkflowForm
          className="toolbar"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            await t.command("billing.generate", {
              period: f.get("period"),
            });
            await load();
          }}
        >
          <label>
            Billing month
            <input
              name="period"
              required
              type="month"
              defaultValue={today().slice(0, 7)}
            />
          </label>
          <button className="button secondary" disabled={t.busy}>
            Generate charges
          </button>
        </WorkflowForm>
      </WorkflowPanel>
      {!household && (
        <div className="metrics billing-metrics">
          <div>
            <small>Outstanding</small>
            <strong>{money(due)}</strong>
          </div>
          <div>
            <small>Unverified payment claims</small>
            <strong>
              {data.payments.filter((p) => p.status === "claim").length}
            </strong>
          </div>
        </div>
      )}
      {!household && (
        <section className="billing-directory">
          <div className="agenda-toolbar">
            <div>
              <h2>Family balances</h2>
              <p>Open a household to review its statement and payments.</p>
            </div>
            <div className="view-switch" aria-label="Balance filter">
              {[
                ["all", "All families"],
                ["due", "Balance due"],
                ["claims", "To verify"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="billing-search">
            <Search size={17} />
            <input
              aria-label="Search family balances"
              type="search"
              placeholder="Search a family…"
              value={query}
              onChange={(e) => navigate({ q: e.target.value }, true)}
            />
          </label>
          {loading ? (
            <p className="ui-empty" role="status">
              Loading balances…
            </p>
          ) : loadError ? (
            <div className="ui-empty" role="alert">
              <p>{loadError}</p>
              <button onClick={() => void load()}>Try again</button>
            </div>
          ) : balances.length ? (
            <div className="balance-list">
              {balances.map((h) => (
                <button
                  className="balance-row"
                  key={h.id}
                  aria-label={`Open statement for ${text(h, "name")}`}
                  onClick={() =>
                    navigate({
                      household: h.id,
                      payment: "",
                      action: "",
                      form: "",
                    })
                  }
                >
                  <Initials name={text(h, "name")} />
                  <span className="balance-name">
                    <strong>{text(h, "name")}</strong>
                    <small>
                      {h.charges} {h.charges === 1 ? "charge" : "charges"}
                      {h.claims > 0
                        ? ` · ${h.claims} payment ${h.claims === 1 ? "claim" : "claims"} to verify`
                        : ""}
                    </small>
                  </span>
                  <span className="balance-amount">
                    <strong>{money(h.due)}</strong>
                    <small>
                      {h.due > 0
                        ? "Outstanding"
                        : h.charges
                          ? "Nothing due"
                          : "No charges yet"}
                    </small>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              ))}
            </div>
          ) : (
            <div className="ui-empty">
              <EmptyArt name="icon-fees" />
              <h3>
                {query
                  ? "No matching families"
                  : filter === "claims"
                    ? "No payments waiting for verification"
                    : filter === "due"
                      ? "No outstanding balances"
                      : "Your household statements will appear here"}
              </h3>
              <p>
                {query
                  ? "Try a different family name."
                  : "Charges and verified payments stay connected to each learner and household."}
              </p>
              {(query || filter !== "all") && (
                <button onClick={() => navigate({ q: "", balance: "all" })}>
                  Show all families
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {household && (
        <section className="statement-record">
          <BackLink onClick={back}>All family balances</BackLink>
          {statementFor !== household || !statement ? (
            <div className="ui-empty" role={loadError ? "alert" : "status"}>
              <h3>
                {loadError
                  ? "We couldn’t load this statement"
                  : "Loading statement…"}
              </h3>
              <p>{loadError}</p>
              {loadError && (
                <button onClick={() => void load()}>Try again</button>
              )}
            </div>
          ) : null}
          {statement && statementFor === household && (
            <>
              <div className="class-record-header">
                <div>
                  <span className="eyebrow">Household statement</span>
                  <h2 ref={heading} tabIndex={-1}>
                    {householdName || "Household"}
                  </h2>
                  <p>Learner fees and event contributions, together.</p>
                </div>
                <Wallet size={28} />
              </div>
              {loadError && (
                <p className="alert" role="alert">
                  {loadError}{" "}
                  <button onClick={() => void load()}>Retry refresh</button>
                </p>
              )}
              <div className="statement-totals">
                <div>
                  <small>Outstanding balance</small>
                  <strong>
                    {money(
                      statement.charges.reduce(
                        (sum, c) => sum + num(c, "due"),
                        0,
                      ),
                    )}
                  </strong>
                </div>
                <div>
                  <small>Verified, unallocated credit</small>
                  <strong>
                    {money(
                      statement.payments
                        .filter((p) => p.status === "verified")
                        .reduce((sum, p) => sum + num(p, "credit"), 0),
                    )}
                  </strong>
                </div>
              </div>
              <h3>Charges</h3>
              {!statement.charges.length && (
                <p className="ui-empty">
                  No charges for this household yet. Use Create a charge at the
                  top of Fees to add one.
                </p>
              )}
              <div className="table-wrap statement-table">
                <table>
                  <thead>
                    <tr>
                      <th>Learner / charge</th>
                      <th>Fund</th>
                      <th>Amount</th>
                      <th>Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.charges.map((ch) => (
                      <tr key={ch.id}>
                        <td>
                          {text(ch, "learner_name")}
                          <small>{text(ch, "description")}</small>
                        </td>
                        <td>
                          <Badge>{statusLabel(text(ch, "category"))}</Badge>
                        </td>
                        <td data-label="Amount">{money(num(ch, "amount"))}</td>
                        <td data-label="Outstanding">
                          {num(ch, "due") === 0 && num(ch, "amount") > 0
                            ? "Paid"
                            : money(num(ch, "due"))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="attendance-heading">
                <div>
                  <h3>Payments & receipts</h3>
                  <p>
                    Verify received money, then allocate it to the learner’s
                    charges.
                  </p>
                </div>
                <Badge>
                  {
                    statement.payments.filter((p) => p.status === "claim")
                      .length
                  }{" "}
                  to verify
                </Badge>
              </div>
              <WorkflowDetails className="task-disclosure">
                <summary>Record money received</summary>
                <p className="fine">
                  A payment claim is not settled money. Verify it against your
                  bank, UPI or cash records before allocation.
                </p>
                <WorkflowForm
                  className="form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const f = new FormData(form),
                      r = await t.command("billing.payment", {
                        household,
                        amount: Math.round(Number(f.get("amount")) * 100),
                        method: f.get("method"),
                        reference: f.get("reference"),
                        key: paymentKey,
                      });
                    if (r !== undefined) {
                      setPaymentKey(crypto.randomUUID());
                      form.reset();
                      navigate({ action: "", form: "" });
                      await load();
                    }
                  }}
                >
                  <label>
                    Amount · INR
                    <input
                      required
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                    />
                  </label>
                  <label>
                    Method
                    <select name="method">
                      <option value="upi">UPI</option>
                      <option value="cash">Cash</option>
                      <option value="bank">Bank</option>
                    </select>
                  </label>
                  <label>
                    Reference
                    <input name="reference" placeholder="UTR / cash note" />
                  </label>
                  <button className="button primary" disabled={t.busy}>
                    Record payment claim
                  </button>
                </WorkflowForm>
              </WorkflowDetails>
              {!statement.payments.length && (
                <p className="ui-empty">No payments reported yet.</p>
              )}
              {statement.payments.map((p) => (
                <div className="payment-row" key={p.id}>
                  <div className="row-detail">
                    <strong>
                      {money(num(p, "amount"))}{" "}
                      <StatusPill status={text(p, "status")} />
                    </strong>
                    <small>
                      {paymentMethod(text(p, "method"))} ·{" "}
                      {text(p, "reference") || "No reference"} ·{" "}
                      {p.status === "verified"
                        ? "Credit " + money(num(p, "credit"))
                        : ""}
                    </small>
                    <small>
                      {formatWhen(text(p, "created_at"), "date")}
                      {p.receipt
                        ? " · Receipt " + text(p, "receipt")
                        : " · Check your bank, UPI or cash record before verifying."}
                    </small>
                  </div>
                  {p.status === "claim" && (
                    <button
                      className="button secondary"
                      disabled={t.busy}
                      onClick={async () => {
                        const saved = await t.command("billing.verify", {
                          id: p.id,
                        });
                        if (saved !== undefined) await load();
                      }}
                    >
                      Verify received
                    </button>
                  )}
                  {p.status === "verified" && (
                    <>
                      <button
                        className="text-button"
                        disabled={num(p, "credit") <= 0}
                        onClick={() => {
                          navigate({
                            payment: p.id,
                            action: "",
                            form: "allocate-payment",
                          });
                          setAmounts({});
                        }}
                      >
                        Allocate
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          t.download(
                            "receipt-" + p.id + ".txt",
                            `${t.school.name}\nReceipt ${p.receipt}\nAmount: ${money(num(p, "amount"))}\nMethod: ${p.method}\nReference: ${p.reference}\nDate: ${p.created_at}`,
                            "text/plain",
                          )
                        }
                      >
                        Receipt
                      </button>
                    </>
                  )}
                </div>
              ))}
              {payment && !selectedPayment && (
                <p className="record-notice">
                  This payment is unavailable for allocation.{" "}
                  <button onClick={() => setPayment("")}>
                    Close allocation
                  </button>
                </p>
              )}
              {payment && selectedPayment && (
                <WorkflowForm
                  className="allocation-panel"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const lines = Object.entries(amounts)
                        .filter(([, amount]) => Number(amount) > 0)
                        .map(([charge, amount]) => ({
                          charge,
                          amount: Math.round(Number(amount) * 100),
                        })),
                      r = await t.command("billing.allocate", {
                        id: payment,
                        key: allocationKey,
                        lines,
                      });
                    if (r) {
                      setAllocationKey(crypto.randomUUID());
                      navigate({ payment: "", form: "" });
                      await load();
                    }
                  }}
                >
                  <div className="attendance-heading">
                    <div>
                      <h3>Allocate this payment</h3>
                      <p>
                        {text(selectedPayment, "reference") ||
                          "Verified payment"}{" "}
                        · {money(availableCredit)} available
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => navigate({ payment: "", form: "" })}
                    >
                      Cancel allocation
                    </button>
                  </div>
                  {statement.charges
                    .filter((c) => num(c, "due") > 0)
                    .map((ch) => (
                      <label key={ch.id}>
                        {text(ch, "learner_name")} · {text(ch, "description")} ·
                        due {money(num(ch, "due"))}
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={num(ch, "due") / 100}
                          value={amounts[ch.id] || ""}
                          onChange={(e) =>
                            setAmounts((a) => ({
                              ...a,
                              [ch.id]: e.target.value,
                            }))
                          }
                        />
                      </label>
                    ))}
                  <div className="allocation-total">
                    <span>
                      Allocating <strong>{money(allocationTotal)}</strong>
                    </span>
                    <span>
                      Credit remaining{" "}
                      <strong>
                        {money(availableCredit - allocationTotal)}
                      </strong>
                    </span>
                  </div>
                  {allocationTotal > availableCredit && (
                    <p className="alert" role="alert">
                      The allocation exceeds this payment’s available credit.
                    </p>
                  )}
                  <button
                    className="button primary"
                    disabled={
                      t.busy ||
                      allocationTotal <= 0 ||
                      allocationTotal > availableCredit
                    }
                  >
                    Allocate payment
                  </button>
                </WorkflowForm>
              )}
              <WorkflowDetails className="correction-panel">
                <summary>Corrections, refunds & reversals</summary>
                <p className="fine">
                  Use a correction to amend an existing financial record. The
                  original record and your reason remain in the ledger.
                </p>
                <WorkflowForm
                  className="form-grid"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    await t.command("billing.correct", {
                      kind: f.get("kind"),
                      id: f.get("id"),
                      amount: f.get("amount")
                        ? Math.round(Number(f.get("amount")) * 100)
                        : undefined,
                      reason: f.get("reason"),
                      key: crypto.randomUUID(),
                    });
                    await load();
                  }}
                >
                  <label>
                    Correction type
                    <select
                      name="kind"
                      value={correctionKind}
                      onChange={(e) => setCorrectionKind(e.target.value)}
                    >
                      <option value="adjustment">Charge adjustment</option>
                      <option value="refund">Refund unallocated credit</option>
                      <option value="reverse-payment">Reverse payment</option>
                      <option value="reverse-allocation">
                        Reverse allocation
                      </option>
                    </select>
                  </label>
                  <label>
                    Record
                    <select
                      name="id"
                      required
                      key={correctionKind}
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Choose a record…
                      </option>
                      {[
                        ...(correctionKind === "adjustment"
                          ? statement.charges
                          : []
                        ).map((c) => ({
                          ...c,
                          label: "Charge · " + text(c, "description"),
                        })),
                        ...(correctionKind === "refund" ||
                        correctionKind === "reverse-payment"
                          ? statement.payments.filter(
                              (p) => p.status === "verified",
                            )
                          : []
                        ).map((p) => ({
                          ...p,
                          label: "Payment · " + money(num(p, "amount")),
                        })),
                        ...(correctionKind === "reverse-allocation"
                          ? statement.allocations
                          : []
                        )
                          .filter((a) => !a.reversed_at)
                          .map((a) => ({
                            ...a,
                            label: "Allocation · " + money(num(a, "amount")),
                          })),
                      ].map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(correctionKind === "adjustment" ||
                    correctionKind === "refund") && (
                    <label>
                      {correctionKind === "adjustment"
                        ? "Amount · INR (negative for concession)"
                        : "Refund amount · INR"}
                      <input
                        required
                        type="number"
                        name="amount"
                        step="0.01"
                        min={correctionKind === "refund" ? "0.01" : undefined}
                      />
                    </label>
                  )}
                  <label>
                    Reason
                    <input name="reason" required minLength={3} />
                  </label>
                  <button className="button secondary" disabled={t.busy}>
                    Record correction
                  </button>
                </WorkflowForm>
              </WorkflowDetails>
            </>
          )}
        </section>
      )}
    </>
  );
}
