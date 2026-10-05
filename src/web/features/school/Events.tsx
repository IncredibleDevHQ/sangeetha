import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Plus,
  Search,
  Users,
  Music2,
} from "lucide-react";
import { WorkflowForm } from "../../components/WorkflowForm";
import { WorkflowDetails } from "../../components/WorkflowDetails";
import { Badge, dateLabel } from "../../components/ui";
import { navigate, useRouteValue } from "../../routes";
import { text, num, money, Select, type Row, type SchoolTools } from "./common";

type EventData = { events: Row[]; registrations: Row[] };
const eventStatus = (event: Row) =>
  event.cancelled_at
    ? "Cancelled"
    : new Date(text(event, "starts_at")).getTime() < Date.now()
      ? "Past event"
      : "Upcoming";

export function EventsView({
  tools,
  finance,
}: {
  tools: SchoolTools;
  finance: boolean;
}) {
  const [data, setData] = useState<EventData>({
    events: [],
    registrations: [],
  });
  const [houses, setHouses] = useState<Row[]>([]);
  const [eventId] = useRouteValue("event"),
    [query, setQuery] = useRouteValue("q"),
    [filter, setFilter] = useRouteValue("status", "upcoming");
  const [mode] = useRouteValue("mode", "overview"),
    [action] = useRouteValue("action"),
    [form] = useRouteValue("form"),
    [participant] = useRouteValue("participant");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const request = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  const creating = action === "create-event" || form === "create-event";
  const registering =
    action === "register-participants" || form === "register-participants";
  const activeMode = form.startsWith("save-programme")
    ? "programme"
    : form === "record-expense"
      ? "funds"
      : mode;
  async function load() {
    const id = ++request.current;
    setError("");
    try {
      const [events, households] = await Promise.all([
        tools.read<EventData>("events"),
        tools.read<Row[]>("households"),
      ]);
      if (id === request.current) {
        setData(events);
        setHouses(households);
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
    heading.current?.focus();
  }, [eventId, creating, registering, loading]);
  const event = data.events.find((e) => e.id === eventId);
  const registrations = data.registrations.filter(
    (r) => r.event_id === eventId,
  );
  const programme = [...registrations].sort(
    (a, b) =>
      Number(!!b.performing) - Number(!!a.performing) ||
      num(a, "programme_order") - num(b, "programme_order") ||
      text(a, "participant").localeCompare(text(b, "participant")),
  );
  const openEvent = (id: string) =>
    navigate({
      event: id,
      mode: "",
      participant: "",
      household: "",
      action: "",
      form: "",
      q: "",
    });
  const closeAction = () => navigate({ action: "", form: "", household: "" });
  const shown = data.events
    .filter(
      (e) =>
        (filter === "all" ||
          (filter === "upcoming"
            ? eventStatus(e) === "Upcoming"
            : filter === "past"
              ? eventStatus(e) === "Past event"
              : !!e.cancelled_at)) &&
        `${text(e, "title")} ${text(e, "venue")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      filter === "upcoming"
        ? text(a, "starts_at").localeCompare(text(b, "starts_at"))
        : text(b, "starts_at").localeCompare(text(a, "starts_at")),
    );
  if (loading)
    return (
      <p className="ui-empty" role="status">
        Loading school events…
      </p>
    );
  if (error)
    return (
      <div className="ui-empty" role="alert">
        <h2>We couldn’t load your events</h2>
        <p>{error}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );
  if (creating)
    return (
      <section className="event-composer">
        <button className="back-link" onClick={closeAction}>
          <ArrowLeft size={16} />
          Back to events
        </button>
        <div className="event-heading">
          <div>
            <span className="eyebrow">Bring the school together</span>
            <h2 ref={heading} tabIndex={-1}>
              Create an event
            </h2>
            <p>A recital, workshop or gathering for your music community.</p>
          </div>
        </div>
        <WorkflowForm
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const result = await tools.command<{ id: string }>("event.create", {
              title: f.get("title"),
              starts: new Date(
                String(f.get("starts")) + "+05:30",
              ).toISOString(),
              venue: f.get("venue"),
              description: f.get("description"),
              basis: f.get("basis"),
              contribution: Math.round(Number(f.get("amount")) * 100),
            });
            if (result) {
              await load();
              openEvent(result.id);
            }
          }}
        >
          <label className="wide">
            Title
            <input
              name="title"
              required
              maxLength={150}
              placeholder="A celebration of our young musicians"
            />
          </label>
          <label>
            Start (IST)
            <input type="datetime-local" name="starts" required />
          </label>
          <label>
            Venue
            <input
              name="venue"
              required
              maxLength={300}
              placeholder="School hall or online meeting link"
            />
          </label>
          <label className="wide">
            Description
            <textarea
              name="description"
              rows={3}
              maxLength={3000}
              placeholder="What should families know?"
            />
          </label>
          <div className="event-form-section wide">
            <h3>Participation contribution</h3>
            <p>
              Choose how registration creates charges. Enter zero for a free
              event.
            </p>
          </div>
          <label>
            Contribution (INR)
            <input
              name="amount"
              type="number"
              required
              min="0"
              max="10000000"
              step="0.01"
              defaultValue="0"
            />
          </label>
          <label>
            Contribution basis
            <select name="basis">
              <option value="person">Per person</option>
              <option value="household">Per household</option>
            </select>
          </label>
          <p className="fine wide">
            Per household creates one contribution even when several family
            members participate. Registration records the charge; payments are
            verified and allocated in Fees.
          </p>
          <div className="event-form-footer wide">
            <button
              type="button"
              className="button secondary"
              onClick={closeAction}
            >
              Cancel
            </button>
            <button className="button primary" disabled={tools.busy}>
              Create event
            </button>
          </div>
        </WorkflowForm>
      </section>
    );
  if (!eventId)
    return (
      <>
        <div className="event-heading">
          <div>
            <span className="eyebrow">Music brings us together</span>
            <h2 ref={heading} tabIndex={-1}>
              School gatherings
            </h2>
            <p>
              Plan the occasion, welcome families and prepare the programme.
            </p>
          </div>
          <button
            className="button primary"
            onClick={() => navigate({ action: "create-event", form: "" })}
          >
            <Plus size={16} />
            Create event
          </button>
        </div>
        <div className="event-list-toolbar">
          <div className="segmented" aria-label="Event status">
            {["upcoming", "past", "cancelled", "all"].map((s) => (
              <button
                key={s}
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
              >
                {s === "all" ? "All events" : s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <label className="event-search">
            <Search size={17} />
            <input
              type="search"
              aria-label="Search events"
              placeholder="Find an event or venue"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="event-directory">
          {shown.map((e) => (
            <button
              className="event-card"
              key={e.id}
              onClick={() => openEvent(e.id)}
            >
              <div className="event-card-top">
                <span className="event-date">
                  <CalendarDays size={18} />
                  {dateLabel(text(e, "starts_at"), true)}
                </span>
                <Badge tone={e.cancelled_at ? "attention" : "neutral"}>
                  {eventStatus(e)}
                </Badge>
              </div>
              <strong>{text(e, "title")}</strong>
              <span className="event-venue">
                <MapPin size={15} />
                {text(e, "venue")}
              </span>
              <p>
                {text(e, "description") ||
                  "Open the event to plan participation and performances."}
              </p>
              <div className="event-card-bottom">
                <span>
                  <Users size={15} />
                  {
                    data.registrations.filter(
                      (r) => r.event_id === e.id && !r.cancelled_at,
                    ).length
                  }{" "}
                  registered
                </span>
                <span>
                  {num(e, "contribution")
                    ? `${money(num(e, "contribution"))} / ${text(e, "basis")}`
                    : "Free event"}
                </span>
                <ArrowUpRight size={17} />
              </div>
            </button>
          ))}
        </div>
        {!shown.length && (
          <div className="ui-empty">
            <CalendarDays size={28} />
            <h3>
              {query
                ? "No matching events"
                : data.events.length
                  ? `No ${filter === "all" ? "matching" : filter} events`
                  : "Your next gathering starts here"}
            </h3>
            <p>
              {query
                ? "Try a different title or venue."
                : "Create an event, or choose another status to see past occasions."}
            </p>
            {query && (
              <button onClick={() => setQuery("")}>Clear search</button>
            )}
          </div>
        )}
      </>
    );
  if (!event)
    return (
      <>
        <button className="back-link" onClick={() => openEvent("")}>
          <ArrowLeft size={16} />
          All events
        </button>
        <p className="ui-empty" role="alert">
          This event is not available.
        </p>
      </>
    );
  if (registering)
    return (
      <section className="event-composer">
        <button className="back-link" onClick={closeAction}>
          <ArrowLeft size={16} />
          Back to event
        </button>
        <div className="event-heading">
          <div>
            <span className="eyebrow">{text(event, "title")}</span>
            <h2 ref={heading} tabIndex={-1}>
              Register participants
            </h2>
            <p>One household response, a separate place for each person.</p>
          </div>
        </div>
        <EventRegistration
          tools={tools}
          event={event}
          households={houses}
          registrations={registrations}
          onSaved={async () => {
            await load();
            navigate({
              mode: "participants",
              action: "",
              form: "",
              household: "",
            });
          }}
        />
      </section>
    );
  return (
    <>
      <button className="back-link" onClick={() => openEvent("")}>
        <ArrowLeft size={16} />
        All events
      </button>
      <div className="event-heading">
        <div>
          <span className="eyebrow">School event</span>
          <h2 ref={heading} tabIndex={-1}>
            {text(event, "title")}
          </h2>
          <p>
            <CalendarDays size={15} />
            {dateLabel(text(event, "starts_at"), true)} <span>·</span>{" "}
            <MapPin size={15} />
            {text(event, "venue")}
          </p>
        </div>
        <Badge tone={event.cancelled_at ? "attention" : "success"}>
          {eventStatus(event)}
        </Badge>
      </div>
      <div className="event-tabs segmented" aria-label="Event sections">
        {[
          "overview",
          "participants",
          "programme",
          ...(finance ? ["funds"] : []),
        ].map((s) => (
          <button
            key={s}
            aria-pressed={activeMode === s}
            onClick={() =>
              navigate({
                mode: s,
                action: "",
                form: "",
                participant: "",
                household: "",
              })
            }
          >
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {activeMode === "overview" && (
        <div className="event-overview">
          <section className="event-about">
            <h3>About this gathering</h3>
            <p>{text(event, "description") || "No additional event notes."}</p>
            <div className="event-contribution">
              <span>Registration contribution</span>
              <strong>
                {num(event, "contribution")
                  ? money(num(event, "contribution"))
                  : "Free event"}
              </strong>
              <small>
                {num(event, "contribution")
                  ? `Per ${text(event, "basis")}`
                  : "No contribution charged"}
              </small>
            </div>
            <WorkflowDetails
              className="task-disclosure"
              context={{ event: event.id }}
            >
              <summary>Event settings</summary>
              {event.cancelled_at ? (
                <p>
                  This event was cancelled. Registrations are closed; financial
                  records remain available.
                </p>
              ) : (
                <>
                  <p>
                    Cancellation closes registration and cancels participant
                    entries. Handle any charge adjustments or refunds separately
                    in Fees.
                  </p>
                  <button
                    className="button danger"
                    disabled={tools.busy}
                    onClick={async () => {
                      if (
                        await tools.command("event.cancel", { id: event.id })
                      ) {
                        await load();
                        navigate({ action: "", form: "" });
                      }
                    }}
                  >
                    Cancel event
                  </button>
                </>
              )}
            </WorkflowDetails>
          </section>
          <section className="event-next">
            <Users size={24} />
            <h3>
              {registrations.filter((r) => !r.cancelled_at).length} participants
            </h3>
            <p>
              {event.cancelled_at
                ? "Registration is closed. Participant and programme history remain available."
                : "Welcome families and give every performer a place in the programme."}
            </p>
            <button
              className="button primary"
              disabled={!!event.cancelled_at}
              onClick={() =>
                navigate({ action: "register-participants", form: "" })
              }
            >
              Register participants
            </button>
            <button
              className="button secondary"
              onClick={() =>
                navigate({ mode: "programme", action: "", form: "" })
              }
            >
              {event.cancelled_at ? "View programme" : "Plan the programme"}
            </button>
          </section>
        </div>
      )}
      {activeMode === "participants" && (
        <section className="event-participants">
          <div className="event-section-heading">
            <div>
              <h3>Participants</h3>
              <p>
                Registrations: {registrations.length} · Households:{" "}
                {new Set(registrations.map((r) => r.household_id)).size}
              </p>
            </div>
            <button
              className="button primary"
              disabled={!!event.cancelled_at}
              onClick={() =>
                navigate({ action: "register-participants", form: "" })
              }
            >
              <Plus size={15} />
              Register participants
            </button>
          </div>
          {registrations.map((r) => (
            <div className="event-person" key={text(r, "person_id")}>
              <span className="event-person-icon">
                <Users size={17} />
              </span>
              <div>
                <strong>{text(r, "participant")}</strong>
                <small>{text(r, "household")}</small>
              </div>
              <Badge tone={r.cancelled_at ? "attention" : "neutral"}>
                {r.cancelled_at
                  ? "Cancelled"
                  : r.performing
                    ? "Performer"
                    : "Participant"}
              </Badge>
              <button
                className="text-button"
                onClick={() =>
                  navigate({
                    mode: "programme",
                    participant: text(r, "person_id"),
                    action: "",
                    form: "",
                  })
                }
              >
                Programme details
                <ArrowUpRight size={14} />
              </button>
            </div>
          ))}
          {!registrations.length && (
            <div className="ui-empty">
              No participants yet. Register a household to begin.
            </div>
          )}
        </section>
      )}
      {activeMode === "programme" && (
        <section>
          <div className="event-section-heading">
            <div>
              <h3>Programme & rehearsals</h3>
              <p>Set the running order and what each performer will prepare.</p>
            </div>
            <Badge>
              Performers:{" "}
              {
                registrations.filter((r) => r.performing && !r.cancelled_at)
                  .length
              }
            </Badge>
          </div>
          {programme.map((r) => (
            <ProgrammeEntry
              key={text(r, "person_id")}
              tools={tools}
              event={event}
              record={r}
              editing={participant === r.person_id}
              onSaved={async () => {
                await load();
                navigate({ participant: "", action: "", form: "" });
              }}
            />
          ))}
          {!registrations.length && (
            <div className="ui-empty">
              <Music2 size={28} />
              <h3>Make space for your performers</h3>
              <p>
                Register participants first, then add their music and rehearsal
                details.
              </p>
              <button
                disabled={!!event.cancelled_at}
                onClick={() =>
                  navigate({ action: "register-participants", form: "" })
                }
              >
                Register participants
              </button>
            </div>
          )}
        </section>
      )}
      {activeMode === "funds" && finance && (
        <EventFunds key={event.id} tools={tools} event={event.id} />
      )}
    </>
  );
}

function EventRegistration({
  tools,
  event,
  households,
  registrations,
  onSaved,
}: {
  tools: SchoolTools;
  event: Row;
  households: Row[];
  registrations: Row[];
  onSaved: () => Promise<void>;
}) {
  const [household, setHousehold] = useRouteValue("household");
  const [people, setPeople] = useState<Row[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setPeople([]);
    setSelected([]);
    setError("");
    setLoading(!!household);
    if (household)
      tools
        .read<{ people: Row[] }>("household", "?id=" + household)
        .then((d) => {
          if (active) setPeople(d.people);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    return () => {
      active = false;
    };
  }, [tools.read, household, retry]);
  const registered = (id: string) =>
    registrations.some((r) => r.person_id === id);
  const contribution =
    event.basis === "household"
      ? registrations.some((r) => r.household_id === household)
        ? 0
        : num(event, "contribution")
      : num(event, "contribution") * selected.length;
  if (event.cancelled_at)
    return (
      <p className="ui-empty" role="status">
        This event is cancelled and registration is closed.
      </p>
    );
  return (
    <WorkflowForm
      className="event-registration form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await tools.command("event.register", {
            event: event.id,
            household,
            people: selected,
          })
        )
          await onSaved();
      }}
    >
      <div className="wide">
        <Select
          label="Register household"
          rows={households.filter((h) => !h.archived_at)}
          value={household}
          onChange={(id) => {
            setPeople([]);
            setSelected([]);
            setHousehold(id);
          }}
        />
      </div>
      {loading ? (
        <p className="wide" role="status">
          Loading household members…
        </p>
      ) : error ? (
        <div className="wide alert" role="alert">
          {error}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Try again
          </button>
        </div>
      ) : household ? (
        <fieldset className="event-member-picker wide">
          <legend>Who is joining?</legend>
          {people
            .filter((p) => !p.ended_at)
            .map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  disabled={registered(p.id)}
                  checked={registered(p.id) || selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, p.id]
                        : s.filter((id) => id !== p.id),
                    )
                  }
                />
                <span>{text(p, "name")}</span>
                {registered(p.id) && <Badge>Registered</Badge>}
              </label>
            ))}
          {!people.length && <p>No active members in this household.</p>}
        </fieldset>
      ) : (
        <p className="fine wide">
          Choose a household to select its participants.
        </p>
      )}
      <div className="event-registration-total wide">
        <div>
          <span>{selected.length} new participants</span>
          <small>
            {event.basis === "household"
              ? "One contribution per household"
              : "One contribution per person"}
          </small>
        </div>
        <strong>{money(selected.length ? contribution : 0)}</strong>
      </div>
      <p className="fine wide">
        Registration adds the contribution to this household’s statement. It
        does not record a payment. Existing registrations are retained.
      </p>
      <button
        className="button primary"
        disabled={
          tools.busy || loading || !!error || !household || !selected.length
        }
      >
        Register participants
      </button>
    </WorkflowForm>
  );
}
function ProgrammeEntry({
  tools,
  event,
  record: r,
  editing,
  onSaved,
}: {
  tools: SchoolTools;
  event: Row;
  record: Row;
  editing: boolean;
  onSaved: () => Promise<void>;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (editing) heading.current?.focus();
  }, [editing]);
  return (
    <article
      className={`programme-entry ${editing ? "is-editing" : ""}`}
      data-route-resource={text(r, "person_id")}
    >
      <div className="programme-entry-heading">
        <span className="programme-position">
          {r.performing ? (
            num(r, "programme_order") || "—"
          ) : (
            <Users size={18} />
          )}
        </span>
        <div>
          <h4 ref={heading} tabIndex={-1}>
            {text(r, "participant")}
          </h4>
          <p>{text(r, "household")}</p>
        </div>
        <Badge>
          {r.cancelled_at
            ? "Cancelled"
            : r.performing
              ? "Performer"
              : "Participant"}
        </Badge>
        <button
          className="text-button"
          onClick={() =>
            navigate({
              participant: editing ? "" : text(r, "person_id"),
              action: "",
              form: "",
            })
          }
        >
          {editing ? "Close editor" : "Edit programme"}
        </button>
      </div>
      {editing ? (
        <WorkflowForm
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await tools.command("event.programme", {
                event: event.id,
                person: r.person_id,
                performing: f.get("performing") === "on",
                order: Number(f.get("order")),
                piece: f.get("piece"),
                rehearsal: f.get("rehearsal"),
              })
            )
              await onSaved();
          }}
        >
          <label className="programme-performer">
            <input
              type="checkbox"
              name="performing"
              defaultChecked={!!r.performing}
            />
            Performer
          </label>
          <label>
            Programme order
            <input
              name="order"
              type="number"
              min="0"
              max="1000"
              defaultValue={num(r, "programme_order")}
            />
          </label>
          <label>
            Piece
            <input
              name="piece"
              maxLength={300}
              defaultValue={text(r, "piece")}
            />
          </label>
          <label>
            Rehearsal
            <input
              name="rehearsal"
              maxLength={500}
              defaultValue={text(r, "rehearsal")}
            />
          </label>
          <button className="button primary" disabled={tools.busy}>
            Save programme
          </button>
        </WorkflowForm>
      ) : (
        <div className="programme-entry-detail">
          <p>
            <span>Piece</span>
            {text(r, "piece") || "Not assigned"}
          </p>
          <p>
            <span>Rehearsal</span>
            {text(r, "rehearsal") || "Not scheduled"}
          </p>
        </div>
      )}
    </article>
  );
}
function EventFunds({ tools, event }: { tools: SchoolTools; event: string }) {
  const [accounts, setAccounts] = useState<{
      charges: Row[];
      expenses: Row[];
      received: number;
    } | null>(null),
    [error, setError] = useState("");
  const [key, setKey] = useState(crypto.randomUUID());
  const request = useRef(0);
  async function load() {
    const id = ++request.current;
    setError("");
    try {
      const result = await tools.read<NonNullable<typeof accounts>>(
        "event-accounts",
        "?id=" + event,
      );
      if (id === request.current) setAccounts(result);
    } catch (e) {
      if (id === request.current) setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [tools.read, event]);
  if (error)
    return (
      <div role="alert" className="ui-empty">
        {error}
        <button onClick={() => void load()}>Try again</button>
      </div>
    );
  if (!accounts)
    return (
      <p role="status" className="ui-empty">
        Loading event funds…
      </p>
    );
  const expenses = accounts.expenses.reduce((n, c) => n + num(c, "amount"), 0);
  return (
    <section>
      <div className="event-section-heading">
        <div>
          <h3>Event funds</h3>
          <p>Keep the gathering’s contributions and expenses in view.</p>
        </div>
        <button
          className="button secondary"
          onClick={() => navigate({ module: "billing" })}
        >
          Open Fees
          <ArrowUpRight size={14} />
        </button>
      </div>
      <dl className="event-fund-summary">
        {[
          [
            "Contributions charged",
            accounts.charges.reduce((n, c) => n + num(c, "amount"), 0),
          ],
          ["Allocated receipts", accounts.received],
          ["Expenses", expenses],
          ["Cash balance", accounts.received - expenses],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{money(Number(value))}</dd>
          </div>
        ))}
      </dl>
      <WorkflowDetails
        className="task-disclosure"
        context={{ event, mode: "funds" }}
      >
        <summary>Record an expense</summary>
        <WorkflowForm
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget,
              f = new FormData(form);
            if (
              await tools.command("event.expense", {
                event,
                description: f.get("description"),
                amount: Math.round(Number(f.get("amount")) * 100),
                key,
              })
            ) {
              setKey(crypto.randomUUID());
              form.reset();
              await load();
              navigate({ action: "", form: "" });
            }
          }}
        >
          <label>
            Expense
            <input name="description" required maxLength={300} />
          </label>
          <label>
            Amount (INR)
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
            />
          </label>
          <button className="button primary" disabled={tools.busy}>
            Record expense
          </button>
        </WorkflowForm>
      </WorkflowDetails>
      <h4>Recorded expenses</h4>
      {accounts.expenses.map((e) => (
        <div className="event-expense" key={e.id}>
          <strong>{text(e, "description")}</strong>
          <span>{money(num(e, "amount"))}</span>
        </div>
      ))}
      {!accounts.expenses.length && (
        <p className="ui-empty">No expenses recorded for this event.</p>
      )}
      <p className="fine">
        Use Fees to verify received money, allocate payments, and make explicit
        charge adjustments or refunds.
      </p>
    </section>
  );
}
