export { EventsView } from "./Events";
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
