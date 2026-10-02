import { WorkflowForm } from "../../components/WorkflowForm";
import { useRouteValue } from "../../routes";
import { WorkflowDetails } from "../../components/WorkflowDetails";
import { useEffect, useState } from "react";
import { type Row, type SchoolTools, text, num, money, Select } from "./common";
import { Badge, EmptyState } from "../../components/ui";
export function Statement({
  tools,
  household,
}: {
  tools: SchoolTools;
  household: Row;
}) {
  const [data, setData] = useState<{ charges: Row[]; payments: Row[] }>({
      charges: [],
      payments: [],
    }),
    [key, setKey] = useState(crypto.randomUUID());
  const load = () =>
    tools
      .read<typeof data>("statement", "?id=" + household.id)
      .then(setData)
      .catch((e) => tools.setError(e.message));
  useEffect(() => {
    void load();
  }, [household.id]);
  return (
    <article className="record-card">
      <h3>{text(household, "name")} statement</h3>
      <div className="statement-total">
        <span>Outstanding balance</span>
        <strong>
          {money(data.charges.reduce((sum, c) => sum + num(c, "due"), 0))}
        </strong>
      </div>
      <div className="table-scroll">
        <table className="statement-table">
          <thead>
            <tr>
              <th>Charge</th>
              <th>Amount</th>
              <th>Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {data.charges.map((c) => (
              <tr key={c.id}>
                <td>
                  <strong>{text(c, "description")}</strong>
                  <small>
                    {text(c, "learner_name") || "Household contribution"}
                  </small>
                </td>
                <td>{money(num(c, "amount"))}</td>
                <td>{money(num(c, "due"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.charges.length && (
        <EmptyState>No charges on this statement.</EmptyState>
      )}
      <h4>Payments</h4>
      {data.payments.map((p) => (
        <div className="learning-row" key={p.id}>
          <div className="row-main">
            <strong>{money(num(p, "amount"))}</strong>
            <p>
              {text(p, "method").toUpperCase()} ·{" "}
              {text(p, "reference") || "No reference"}
            </p>
          </div>
          <Badge tone={p.status === "verified" ? "success" : "attention"}>
            {p.status === "claim" ? "Awaiting verification" : text(p, "status")}
          </Badge>
          {!!p.receipt && (
            <button
              onClick={() =>
                tools.download(
                  "receipt-" + p.id + ".txt",
                  `${tools.school.name}\nReceipt ${text(p, "receipt")}\n${text(household, "name")}\nINR ${num(p, "amount") / 100}\nMethod ${text(p, "method")}\nReference ${text(p, "reference")}\nStatus ${text(p, "status")}`,
                  "text/plain",
                )
              }
            >
              Download receipt
            </button>
          )}
        </div>
      ))}
      {!data.payments.length && (
        <EmptyState>No payments recorded yet.</EmptyState>
      )}
      <h4>Report a payment</h4>
      <WorkflowForm
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            await tools.command("billing.payment", {
              household: household.id,
              amount: Math.round(Number(f.get("amount")) * 100),
              method: f.get("method"),
              reference: f.get("reference"),
              key,
            })
          ) {
            setKey(crypto.randomUUID());
            void load();
          }
        }}
      >
        <label>
          Report a payment (INR)
          <input required type="number" step="0.01" min="0.01" name="amount" />
        </label>
        <label>
          Method
          <select name="method">
            <option value="upi">UPI</option>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
        </label>
        <label>
          Transfer reference
          <input name="reference" required />
        </label>
        <button>Submit for verification</button>
        <small className="wide">
          Reported payments reduce the balance after school verification and
          allocation.
        </small>
      </WorkflowForm>
    </article>
  );
}
export function TeacherAttendance({
  tools,
  occurrence,
  learners,
}: {
  tools: SchoolTools;
  occurrence: Row;
  learners: Row[];
}) {
  return (
    <WorkflowForm
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        await tools.command("class.attendance", {
          id: occurrence.id,
          entries: learners.map((l) => ({
            learner: l.id,
            status: f.get(l.id),
            notes: f.get(l.id + "notes"),
          })),
        });
      }}
    >
      <h4>Assigned batch attendance</h4>
      {learners.map((l) => (
        <label key={l.id}>
          {text(l, "name")}
          <select name={l.id}>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
            <option value="excused">Excused</option>
          </select>
          <input name={l.id + "notes"} placeholder="Attendance note" />
        </label>
      ))}
      <button>Save learner attendance</button>
    </WorkflowForm>
  );
}
export function FamilyEvents({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<{
      events: Row[];
      households: Row[];
      people: Row[];
      registrations: Row[];
    }>({ events: [], households: [], people: [], registrations: [] }),
    [event, setEvent] = useRouteValue("event"),
    [household, setHousehold] = useRouteValue("household"),
    [people, setPeople] = useState<string[]>([]);
  const load = () =>
    tools
      .read<typeof data>("family-events")
      .then(setData)
      .catch((e) => tools.setError(e.message));
  useEffect(() => {
    void load();
  }, [tools.read]);
  if (!data.households.length) return null;
  return (
    <WorkflowForm
      className="form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await tools.command("event.register", { event, household, people }))
          void load();
      }}
    >
      <h3 className="wide">Event participation</h3>
      <Select
        label="Event"
        rows={data.events}
        labelKey="title"
        value={event}
        onChange={setEvent}
      />
      <Select
        label="Household"
        rows={data.households}
        value={household}
        onChange={(v) => {
          setHousehold(v);
          setPeople([]);
        }}
      />
      {event && (
        <p className="wide">
          {text(data.events.find((e) => e.id === event) || {}, "description")} ·
          Contribution{" "}
          {money(
            num(data.events.find((e) => e.id === event) || {}, "contribution"),
          )}{" "}
          per {text(data.events.find((e) => e.id === event) || {}, "basis")}
        </p>
      )}
      <div className="member-picker wide">
        {data.people
          .filter((p) => p.household_id === household)
          .map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={people.includes(p.id)}
                onChange={(e) =>
                  setPeople((v) =>
                    e.target.checked
                      ? [...v, p.id]
                      : v.filter((i) => i !== p.id),
                  )
                }
              />
              {text(p, "name")}
              {data.registrations.some(
                (r) => r.event_id === event && r.person_id === p.id,
              )
                ? " (registered)"
                : ""}
            </label>
          ))}
      </div>
      <button>Confirm participants and contribution</button>
    </WorkflowForm>
  );
}
export function EventsView({
  tools,
  finance,
}: {
  tools: SchoolTools;
  finance: boolean;
}) {
  const [data, setData] = useState<{ events: Row[]; registrations: Row[] }>({
      events: [],
      registrations: [],
    }),
    [houses, setHouses] = useState<Row[]>([]),
    [household, setHousehold] = useRouteValue("household"),
    [event, setEvent] = useRouteValue("event"),
    [people, setPeople] = useState<Row[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [accounts, setAccounts] = useState<{
      charges: Row[];
      expenses: Row[];
      received: number;
    } | null>(null);
  const load = () =>
    tools
      .read<typeof data>("events")
      .then(setData)
      .catch((e) => tools.setError(e.message));
  useEffect(() => {
    void load();
    tools
      .read<Row[]>("households")
      .then(setHouses)
      .catch((e) => tools.setError(e.message));
  }, [tools.read]);
  useEffect(() => {
    if (household)
      tools
        .read<{ people: Row[] }>("household", "?id=" + household)
        .then((d) => {
          setPeople(d.people);
          setSelected([]);
        })
        .catch((e) => tools.setError(e.message));
  }, [household]);
  useEffect(() => {
    if (event && finance)
      tools
        .read<typeof accounts>("event-accounts", "?id=" + event)
        .then(setAccounts)
        .catch((e) => tools.setError(e.message));
  }, [event, data]);
  return (
    <>
      <h2>Events and contributions</h2>
      <WorkflowDetails>
        <summary>Create event</summary>
        <WorkflowForm
          className="form-grid"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await tools.command("event.create", {
                title: f.get("title"),
                starts: new Date(
                  String(f.get("starts")) + "+05:30",
                ).toISOString(),
                venue: f.get("venue"),
                description: f.get("description"),
                basis: f.get("basis"),
                contribution: Math.round(Number(f.get("amount")) * 100),
              })
            )
              void load();
          }}
        >
          <label>
            Title
            <input name="title" required />
          </label>
          <label>
            Start (IST)
            <input type="datetime-local" name="starts" required />
          </label>
          <label>
            Venue
            <input name="venue" required />
          </label>
          <label>
            Contribution (INR)
            <input
              name="amount"
              type="number"
              min="0"
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
          <label>
            Description
            <textarea name="description" />
          </label>
          <button>Create event</button>
        </WorkflowForm>
      </WorkflowDetails>
      <Select
        label="Selected event"
        rows={data.events}
        value={event}
        onChange={setEvent}
        labelKey="title"
      />
      {event && (
        <>
          <p>
            {text(data.events.find((e) => e.id === event) || {}, "venue")} ·{" "}
            {text(data.events.find((e) => e.id === event) || {}, "description")}
          </p>
          <WorkflowForm
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await tools.command("event.register", {
                  event,
                  household,
                  people: selected,
                })
              )
                void load();
            }}
          >
            <Select
              label="Register household"
              rows={houses}
              value={household}
              onChange={setHousehold}
            />
            <div className="member-picker">
              {people.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(p.id)}
                    onChange={(e) =>
                      setSelected((s) =>
                        e.target.checked
                          ? [...s, p.id]
                          : s.filter((i) => i !== p.id),
                      )
                    }
                  />
                  {text(p, "name")}
                </label>
              ))}
            </div>
            <button>Register participants</button>
          </WorkflowForm>
          <h3>Programme and rehearsals</h3>
          {data.registrations
            .filter((r) => r.event_id === event)
            .map((r) => (
              <WorkflowForm
                className="form-grid record-card"
                key={text(r, "person_id")}
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await tools.command("event.programme", {
                    event,
                    person: r.person_id,
                    performing: f.get("performing") === "on",
                    order: Number(f.get("order")),
                    piece: f.get("piece"),
                    rehearsal: f.get("rehearsal"),
                  });
                  void load();
                }}
              >
                <h4 className="wide">
                  {text(r, "participant")} · {text(r, "household")}
                </h4>
                <label>
                  <input
                    type="checkbox"
                    name="performing"
                    defaultChecked={!!r.performing}
                  />{" "}
                  Performer
                </label>
                <label>
                  Order
                  <input
                    name="order"
                    type="number"
                    min="0"
                    defaultValue={num(r, "programme_order")}
                  />
                </label>
                <label>
                  Piece
                  <input name="piece" defaultValue={text(r, "piece")} />
                </label>
                <label>
                  Rehearsal
                  <input name="rehearsal" defaultValue={text(r, "rehearsal")} />
                </label>
                <button>Save programme</button>
              </WorkflowForm>
            ))}
          {accounts && (
            <>
              <h3>Event funds</h3>
              <p>
                Contributions charged{" "}
                {money(
                  accounts.charges.reduce((n, c) => n + num(c, "amount"), 0),
                )}{" "}
                · received {money(accounts.received)} · expenses{" "}
                {money(
                  accounts.expenses.reduce((n, c) => n + num(c, "amount"), 0),
                )}{" "}
                · cash balance{" "}
                {money(
                  accounts.received -
                    accounts.expenses.reduce((n, c) => n + num(c, "amount"), 0),
                )}
              </p>
              <WorkflowForm
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  if (
                    await tools.command("event.expense", {
                      event,
                      description: f.get("description"),
                      amount: Math.round(Number(f.get("amount")) * 100),
                      key: crypto.randomUUID(),
                    })
                  )
                    void load();
                }}
              >
                <label>
                  Expense
                  <input name="description" required />
                </label>
                <label>
                  INR
                  <input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <button>Record expense</button>
              </WorkflowForm>
              <p>
                Use Fees to verify and allocate shared payments to event line
                items.
              </p>
            </>
          )}
          <button
            onClick={async () => {
              await tools.command("event.cancel", { id: event });
              void load();
            }}
          >
            Cancel event
          </button>
          <p>
            Cancellation closes registration. Adjust charges and issue refunds
            explicitly in Fees.
          </p>
        </>
      )}
    </>
  );
}
