import PhoneInput from "../auth/PhoneInput";
import { useEffect, useState } from "react";
import { parseCsv, csvExport } from "../../../core/csv";
import { text, num, today, Select, type Row, type SchoolTools } from "./common";
type Person = {
  name: string;
  phone: string;
  email: string;
  relationship: string;
  learner: boolean;
  level: string;
};
const blank = (): Person => ({
  name: "",
  phone: "",
  email: "",
  relationship: "Member",
  learner: true,
  level: "Beginner",
});
type Detail = {
  household: Row;
  people: Row[];
  notes: Row[];
  tasks: Row[];
  activity: Row[];
  relationships: Row[];
};
export default function Households({ tools: t }: { tools: SchoolTools }) {
  const [rows, setRows] = useState<Row[]>([]),
    [query, setQuery] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [create, setCreate] = useState(false),
    [name, setName] = useState(""),
    [people, setPeople] = useState<Person[]>([blank()]),
    [primary, setPrimary] = useState(0),
    [billing, setBilling] = useState(0),
    [note, setNote] = useState(""),
    [task, setTask] = useState(""),
    [due, setDue] = useState(today()),
    [preview, setPreview] = useState<
      {
        index: number;
        data: unknown;
        errors: string[];
        possibleDuplicate: boolean;
      }[]
    >([]),
    [selected, setSelected] = useState<number[]>([]),
    [views, setViews] = useState<Row[]>([]),
    [importKey, setImportKey] = useState(crypto.randomUUID());
  async function load() {
    setRows(
      await t.read<Row[]>("households", "?q=" + encodeURIComponent(query)),
    );
    setViews(await t.read<Row[]>("saved-views"));
  }
  useEffect(() => {
    load().catch((e) => t.setError(e.message));
  }, [t.read, query]);
  async function open(id: string) {
    setDetail(await t.read<Detail>("household", "?id=" + id));
  }
  async function refreshDetail() {
    await load();
    if (detail) await open(detail.household.id);
  }
  function change(i: number, key: keyof Person, value: string | boolean) {
    setPeople((p) =>
      p.map((item, index) => (index === i ? { ...item, [key]: value } : item)),
    );
  }
  async function importFile(file: File) {
    try {
      const data = parseCsv(await file.text()),
        headers = data.shift()!.map((s) => s.trim().toLowerCase()),
        groups = new Map<
          string,
          { name: string; people: Person[]; primary: number }
        >();
      for (const line of data) {
        const row = Object.fromEntries(
          headers.map((h, i) => [h, line[i] || ""]),
        );
        if (!row.household || !row.name)
          throw Error("CSV requires household and name columns.");
        const group = groups.get(row.household) || {
          name: row.household,
          people: [],
          primary: 0,
        };
        group.people.push({
          name: row.name,
          phone: (row.phone || "").replace(/^'(?=\+)/, ""),
          email: row.email || "",
          relationship: row.relationship || "Member",
          learner: row.learner !== "false",
          level: row.level || "Beginner",
        });
        if (row.primary === "true") group.primary = group.people.length - 1;
        groups.set(row.household, group);
      }
      const result = await t.command<typeof preview>("import.preview", {
        rows: [...groups.values()],
      });
      if (result) {
        setPreview(result);
        setSelected(
          result
            .filter((r) => !r.errors.length && !r.possibleDuplicate)
            .map((r) => r.index),
        );
        setImportKey(crypto.randomUUID());
      }
    } catch (e) {
      t.setError((e as Error).message);
    }
  }
  async function exportRoster() {
    const data: unknown[][] = [
      [
        "household",
        "name",
        "phone",
        "email",
        "relationship",
        "learner",
        "level",
        "primary",
      ],
    ];
    for (const h of rows) {
      const d = await t.read<Detail>("household", "?id=" + h.id);
      for (const p of d.people)
        data.push([
          h.name,
          p.name,
          p.phone,
          p.email,
          p.relationship,
          !!p.learner_id,
          p.level,
          p.id === d.household.primary_person_id,
        ]);
    }
    t.download("students.csv", csvExport(data));
  }
  return (
    <>
      <div className="section-heading">
        <h2>Households & students</h2>
        <button
          className="button primary"
          onClick={() => {
            setCreate(!create);
            setDetail(null);
          }}
        >
          New household
        </button>
      </div>
      <p className="fine">
        One family contact, separate learners. Shared phone numbers never merge
        students.
      </p>
      <div className="toolbar">
        <input
          aria-label="Search households"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search family or learner name"
        />
        <button
          className="text-button"
          onClick={() =>
            t
              .command("view.save", { name: query || "All households", query })
              .then(load)
          }
        >
          Save this view
        </button>
        <button className="text-button" onClick={exportRoster}>
          Export roster
        </button>
        <label className="file-button">
          Import CSV
          <input
            type="file"
            accept=".csv"
            onChange={(e) =>
              e.target.files?.[0] && importFile(e.target.files[0])
            }
          />
        </label>
      </div>
      {!!views.length && (
        <div className="filter-chips">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() =>
                setQuery(String((v.filters as { query: string }).query))
              }
            >
              {text(v, "name")}
            </button>
          ))}
        </div>
      )}
      {create && (
        <section className="panel">
          <h3>Create household</h3>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const result = await t.command<{ id: string }>(
                "household.create",
                { name, people, primary, billing },
              );
              if (result) {
                setCreate(false);
                setName("");
                setPeople([blank()]);
                await load();
                await open(result.id);
              }
            }}
          >
            <label>
              Household name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Iyer household"
              />
            </label>
            {people.map((p, i) => (
              <fieldset className="person-form" key={i}>
                <legend>Person {i + 1}</legend>
                <div className="form-grid">
                  <label>
                    Name
                    <input
                      required
                      value={p.name}
                      onChange={(e) => change(i, "name", e.target.value)}
                    />
                  </label>
                  <label>
                    Relationship
                    <input
                      value={p.relationship}
                      onChange={(e) =>
                        change(i, "relationship", e.target.value)
                      }
                    />
                  </label>
                  <PhoneInput
                    label="Phone (optional for children)"
                    value={p.phone}
                    onChange={(v) => change(i, "phone", v)}
                  />
                  <label>
                    Email (optional)
                    <input
                      type="email"
                      value={p.email}
                      onChange={(e) => change(i, "email", e.target.value)}
                    />
                  </label>
                  <label>
                    Learning level
                    <input
                      value={p.level}
                      onChange={(e) => change(i, "level", e.target.value)}
                    />
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={p.learner}
                      onChange={(e) => change(i, "learner", e.target.checked)}
                    />
                    Attends music classes
                  </label>
                  <label className="check-label">
                    <input
                      type="radio"
                      name="primary"
                      checked={primary === i}
                      onChange={() => setPrimary(i)}
                    />
                    Primary contact
                  </label>
                  <label className="check-label">
                    <input
                      type="radio"
                      name="billing"
                      checked={billing === i}
                      onChange={() => setBilling(i)}
                    />
                    Billing contact
                  </label>
                </div>
              </fieldset>
            ))}
            <div className="toolbar">
              <button
                type="button"
                className="text-button"
                onClick={() => setPeople((p) => [...p, blank()])}
              >
                + Add family member
              </button>
              <button className="button primary" disabled={t.busy}>
                Create household
              </button>
            </div>
          </form>
        </section>
      )}
      {!!preview.length && (
        <section className="panel">
          <h3>Import preview</h3>
          <p className="fine">
            Columns: household, name, phone, email, relationship, learner,
            level, primary. Check duplicate suggestions before selecting them.
          </p>
          {preview.map((p) => (
            <label className="check-label" key={p.index}>
              <input
                type="checkbox"
                disabled={!!p.errors.length}
                checked={selected.includes(p.index)}
                onChange={(e) =>
                  setSelected((s) =>
                    e.target.checked
                      ? [...s, p.index]
                      : s.filter((i) => i !== p.index),
                  )
                }
              />
              {String(
                (p.data as { name?: string } | null)?.name || "Invalid row",
              )}{" "}
              {p.possibleDuplicate ? "· possible duplicate" : ""}{" "}
              {p.errors.join(", ")}
            </label>
          ))}
          <button
            className="button primary"
            disabled={t.busy || !selected.length}
            onClick={async () => {
              const result = await t.command("import.commit", {
                key: importKey,
                rows: preview
                  .filter((p) => selected.includes(p.index))
                  .map((p) => p.data),
              });
              if (result) {
                setPreview([]);
                await load();
              }
            }}
          >
            Import selected households
          </button>
        </section>
      )}
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Household</th>
                <th>Primary contact</th>
                <th>Learners</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.id}>
                  <td>
                    <button className="text-button" onClick={() => open(h.id)}>
                      {text(h, "name")}
                    </button>
                  </td>
                  <td>
                    {text(h, "contact_name")}
                    <small>{text(h, "phone") || text(h, "email")}</small>
                  </td>
                  <td>{num(h, "learner_count")}</td>
                  <td>{h.archived_at ? "Archived" : "Active"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && (
            <p className="empty">
              Create your first household to start the roster.
            </p>
          )}
        </div>
      </section>
      {detail && (
        <section className="panel">
          <div className="section-heading">
            <h2>{text(detail.household, "name")}</h2>
            <button className="text-button" onClick={() => setDetail(null)}>
              Close
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              await t.command("household.update", {
                id: detail.household.id,
                name: form.get("name"),
                primary: form.get("primary"),
                billing: form.get("billing"),
                version: detail.household.version,
                archive: !!detail.household.archived_at,
              });
              await refreshDetail();
            }}
          >
            <div className="form-grid">
              <label>
                Household name
                <input
                  name="name"
                  required
                  defaultValue={text(detail.household, "name")}
                  key={detail.household.version as number}
                />
              </label>
              <label>
                Primary contact
                <select
                  name="primary"
                  defaultValue={text(detail.household, "primary_person_id")}
                >
                  {detail.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {text(p, "name")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Billing contact
                <select
                  name="billing"
                  defaultValue={text(detail.household, "billing_person_id")}
                >
                  {detail.people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {text(p, "name")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="toolbar">
              <button className="button primary" disabled={t.busy}>
                Save household
              </button>
              <button
                type="button"
                className="text-button danger"
                onClick={async () => {
                  await t.command("household.update", {
                    id: detail.household.id,
                    name: detail.household.name,
                    primary: detail.household.primary_person_id,
                    billing: detail.household.billing_person_id,
                    version: detail.household.version,
                    archive: !detail.household.archived_at,
                  });
                  await refreshDetail();
                }}
              >
                {detail.household.archived_at
                  ? "Restore household"
                  : "Archive household"}
              </button>
            </div>
          </form>
          <h3 className="pending-title">Family members</h3>
          {detail.people.map((p) => (
            <details className="member-detail" key={p.id}>
              <summary>
                {text(p, "name")} ·{" "}
                {p.learner_id ? text(p, "level") : "Contact only"}
              </summary>
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await t.command("person.update", {
                    id: p.id,
                    name: f.get("name"),
                    phone: f.get("phone"),
                    email: f.get("email"),
                    relationship: p.relationship,
                    learner: !!p.learner_id,
                    level: f.get("level"),
                    optOut: f.get("optOut") === "on",
                  });
                  await refreshDetail();
                }}
              >
                <label>
                  Name
                  <input name="name" required defaultValue={text(p, "name")} />
                </label>
                <PhoneInput
                  label="Phone"
                  name="phone"
                  defaultValue={text(p, "phone")}
                />
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    defaultValue={text(p, "email")}
                  />
                </label>
                <label>
                  Level
                  <input
                    name="level"
                    defaultValue={text(p, "level") || "Beginner"}
                  />
                </label>
                <label className="check-label">
                  <input
                    name="optOut"
                    type="checkbox"
                    defaultChecked={!!p.contact_opt_out}
                  />
                  Opt out of messages
                </label>
                <button className="button secondary" disabled={t.busy}>
                  Save person
                </button>
              </form>
            </details>
          ))}
          <div className="form-grid">
            <div>
              <h3>Guardian relationships</h3>
              <p>
                Relationships describe the household. Learning access is granted
                separately.
              </p>
              {detail.relationships.map((r) => (
                <p key={text(r, "guardian_id") + text(r, "dependant_id")}>
                  {text(
                    detail.people.find((p) => p.id === r.guardian_id) || {},
                    "name",
                  )}{" "}
                  →{" "}
                  {text(
                    detail.people.find((p) => p.id === r.dependant_id) || {},
                    "name",
                  )}{" "}
                  <button
                    onClick={async () => {
                      await t.command("guardian.relationship", {
                        guardian: r.guardian_id,
                        dependant: r.dependant_id,
                        remove: true,
                      });
                      await refreshDetail();
                    }}
                  >
                    Remove
                  </button>
                </p>
              ))}
              <form
                className="form-grid"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  await t.command("guardian.relationship", {
                    guardian: f.get("guardian"),
                    dependant: f.get("dependant"),
                  });
                  await refreshDetail();
                }}
              >
                <label>
                  Guardian
                  <select name="guardian">
                    {detail.people.map((p) => (
                      <option value={p.id} key={p.id}>
                        {text(p, "name")}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Dependant
                  <select name="dependant">
                    {detail.people.map((p) => (
                      <option value={p.id} key={p.id}>
                        {text(p, "name")}
                      </option>
                    ))}
                  </select>
                </label>
                <button>Save relationship</button>
              </form>
              <h3 className="pending-title">Internal notes</h3>
              {detail.notes.map((n) => (
                <p key={n.id} className="note">
                  {text(n, "text")}
                </p>
              ))}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await t.command("household.note", {
                    id: detail.household.id,
                    text: note,
                  });
                  setNote("");
                  await refreshDetail();
                }}
              >
                <label>
                  Add note
                  <textarea
                    required
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button className="button secondary" disabled={t.busy}>
                  Add note
                </button>
              </form>
            </div>
            <div>
              <h3 className="pending-title">Follow-ups</h3>
              {detail.tasks.map((task) => (
                <div className="list-row" key={task.id}>
                  <span>
                    {text(task, "title")} · {text(task, "due_on")}
                  </span>
                  {task.done_at ? (
                    <span>Done</span>
                  ) : (
                    <button
                      className="text-button"
                      onClick={async () => {
                        await t.command("task.complete", { id: task.id });
                        await refreshDetail();
                      }}
                    >
                      Mark done
                    </button>
                  )}
                </div>
              ))}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await t.command("household.task", {
                    id: detail.household.id,
                    title: task,
                    due,
                  });
                  setTask("");
                  await refreshDetail();
                }}
              >
                <label>
                  Follow-up
                  <input
                    required
                    value={task}
                    onChange={(e) => setTask(e.target.value)}
                  />
                </label>
                <label>
                  Due date
                  <input
                    required
                    type="date"
                    value={due}
                    onChange={(e) => setDue(e.target.value)}
                  />
                </label>
                <button className="button secondary" disabled={t.busy}>
                  Add follow-up
                </button>
              </form>
            </div>
          </div>
          <h3 className="pending-title">Activity</h3>
          {detail.activity.map((a, i) => (
            <p className="fine" key={i}>
              {text(a, "action")} ·{" "}
              {new Date(text(a, "created_at")).toLocaleString("en-IN")}
            </p>
          ))}
        </section>
      )}
    </>
  );
}
