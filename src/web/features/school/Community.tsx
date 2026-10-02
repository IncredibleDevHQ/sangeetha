import { useEffect, useState } from "react";
import { type Row, type SchoolTools, text, num, money, Select } from "./common";
import { Upload, Review, LibraryView } from "./Learning";
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
      {data.charges.map((c) => (
        <p key={c.id}>
          {text(c, "learner_name")} · {text(c, "description")} ·{" "}
          {money(num(c, "amount"))} · outstanding {money(num(c, "due"))}
        </p>
      ))}
      {data.payments.map((p) => (
        <p key={p.id}>
          Payment {money(num(p, "amount"))} · {text(p, "status")} ·{" "}
          {text(p, "receipt")}
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
        </p>
      ))}
      <form
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
      </form>
    </article>
  );
}
export function PortalView({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<Record<string, Row[]>>({}),
    [assets, setAssets] = useState<Record<string, string[]>>({});
  const load = () =>
    tools
      .read<typeof data>("portal")
      .then(setData)
      .catch((e) => tools.setError(e.message));
  useEffect(() => {
    void load();
  }, [tools.read]);
  return (
    <>
      <h2>My learning and teaching</h2>
      <p>
        Your access is assigned separately for each learner, household and
        teaching batch.
      </p>
      {(data.learners || []).map((l) => (
        <article className="record-card" key={l.id}>
          <h3>
            {text(l, "name")} · {text(l, "level")}
          </h3>
          {(data.practice || [])
            .filter((p) => p.learner_id === l.id)
            .map((p) => (
              <p key={p.id}>
                {text(p, "text")} · due {text(p, "due_on").slice(0, 10)}{" "}
                {p.completed_at ? (
                  "Completed"
                ) : (
                  <button
                    onClick={async () => {
                      await tools.command("practice.complete", { id: p.id });
                      void load();
                    }}
                  >
                    Mark practiced
                  </button>
                )}
              </p>
            ))}
          <p>
            Attendance:{" "}
            {
              (data.attendance || []).filter(
                (a) => a.learner_id === l.id && a.status === "present",
              ).length
            }{" "}
            present of{" "}
            {
              (data.attendance || []).filter((a) => a.learner_id === l.id)
                .length
            }{" "}
            marked classes.
          </p>
          {["recording-reuse", "label-export"].map((purpose) => (
            <label key={purpose}>
              <input
                type="checkbox"
                checked={(data.consents || []).some(
                  (d) =>
                    d.learner_id === l.id &&
                    d.purpose === purpose &&
                    d.allowed === true,
                )}
                onChange={async (e) => {
                  await tools.command("dataset.consent", {
                    learner: l.id,
                    purpose,
                    allowed: e.target.checked,
                  });
                  void load();
                }}
              />{" "}
              Allow{" "}
              {purpose === "recording-reuse"
                ? "recordings to be reused for dataset work"
                : "verified feedback labels to be exported"}
            </label>
          ))}
          {(data.tests || [])
            .filter((t) => t.learner_id === l.id)
            .map((t) => (
              <div key={t.id}>
                <h4>{text(t, "title")}</h4>
                <p>
                  {text(t, "instructions")} · due{" "}
                  {new Date(text(t, "due_at")).toLocaleString("en-IN", {
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  })}{" "}
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
                <Upload
                  tools={tools}
                  learner={l.id}
                  onReady={(id) => {
                    void load();
                    setAssets((a) => ({
                      ...a,
                      [t.id + ":" + l.id]: [
                        ...(a[t.id + ":" + l.id] || []),
                        id,
                      ],
                    }));
                  }}
                />
                <div className="member-picker">
                  {(data.recordings || [])
                    .filter((a) => a.learner_id === l.id)
                    .map((a) => (
                      <label key={a.id}>
                        <input
                          type="checkbox"
                          checked={(assets[t.id + ":" + l.id] || []).includes(
                            a.id,
                          )}
                          onChange={(e) =>
                            setAssets((v) => ({
                              ...v,
                              [t.id + ":" + l.id]: e.target.checked
                                ? [...(v[t.id + ":" + l.id] || []), a.id]
                                : (v[t.id + ":" + l.id] || []).filter(
                                    (id) => id !== a.id,
                                  ),
                            }))
                          }
                        />
                        {text(a, "filename")} · {num(a, "duration_ms") / 1000}s
                      </label>
                    ))}
                </div>
                <p>
                  {(assets[t.id + ":" + l.id] || []).length} recording(s) ready
                </p>
                <button
                  disabled={!(assets[t.id + ":" + l.id] || []).length}
                  onClick={async () => {
                    if (
                      await tools.command("test.submit", {
                        test: t.id,
                        learner: l.id,
                        assets: assets[t.id + ":" + l.id],
                      })
                    ) {
                      setAssets((a) => ({ ...a, [t.id + ":" + l.id]: [] }));
                      void load();
                    }
                  }}
                >
                  Submit new version
                </button>
              </div>
            ))}
        </article>
      ))}
      <h3>Classes</h3>
      {(data.classes || []).map((o) => (
        <article key={o.id} className="record-card">
          <strong>{text(o, "batch_name")}</strong> ·{" "}
          {new Date(text(o, "starts_at")).toLocaleString("en-IN", {
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })}{" "}
          {Intl.DateTimeFormat().resolvedOptions().timeZone} ·{" "}
          {text(o, "status")}
          {(data.teachingBatches || []).some((b) => b.id === o.batch_id) && (
            <TeacherAttendance
              tools={tools}
              occurrence={o}
              learners={(data.teachingLearners || []).filter(
                (l) => l.batch_id === o.batch_id,
              )}
            />
          )}
        </article>
      ))}
      <LibraryView
        tools={tools}
        manage={false}
        batches={data.teachingBatches || []}
        learners={data.teachingLearners || []}
        portalLearners={data.learners || []}
      />
      {(data.submissions || []).map((s) => (
        <Review
          key={s.id}
          tools={tools}
          submission={s}
          labels={[]}
          canPublish={false}
        />
      ))}
      {(data.households || []).map((h) => (
        <Statement tools={tools} household={h} key={h.id} />
      ))}
      <FamilyEvents tools={tools} />
    </>
  );
}
function TeacherAttendance({
  tools,
  occurrence,
  learners,
}: {
  tools: SchoolTools;
  occurrence: Row;
  learners: Row[];
}) {
  return (
    <form
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
    </form>
  );
}
function FamilyEvents({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<{
      events: Row[];
      households: Row[];
      people: Row[];
      registrations: Row[];
    }>({ events: [], households: [], people: [], registrations: [] }),
    [event, setEvent] = useState(""),
    [household, setHousehold] = useState(""),
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
    <form
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
    </form>
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
    [household, setHousehold] = useState(""),
    [event, setEvent] = useState(""),
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
      <details>
        <summary>Create event</summary>
        <form
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
        </form>
      </details>
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
          <form
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
          </form>
          <h3>Programme and rehearsals</h3>
          {data.registrations
            .filter((r) => r.event_id === event)
            .map((r) => (
              <form
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
              </form>
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
              <form
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
              </form>
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
