import { WorkflowForm } from "../../components/WorkflowForm";
import { ChevronRight, Search, Plus } from "lucide-react";
import {
  Badge,
  BackLink,
  Initials,
  StatusPill,
  statusLabel,
} from "../../components/ui";
import { formatWhen } from "../../lib/when";
import { EmptyArt } from "../../components/Art";
import { useRouteValue, navigate } from "../../routes";
import {
  WorkflowDetails,
  WorkflowPanel,
  openWorkflow,
} from "../../components/WorkflowDetails";
import { PageActions } from "../../components/PageHeader";
import PhoneInput from "../auth/PhoneInput";
import { useEffect, useRef, useState } from "react";
import { parseCsv, csvExport } from "../../../core/csv";
import {
  text,
  num,
  phone,
  plural,
  today,
  Select,
  type Row,
  type SchoolTools,
} from "./common";
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
    [query] = useRouteValue("q"),
    [detail, setDetail] = useState<Detail | null>(null),
    [createAction, setCreateAction] = useRouteValue("action"),
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
  const [section] = useRouteValue("section", "summary");
  const [form] = useRouteValue("form");
  const [householdId] = useRouteValue("household");
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [revision, setRevision] = useState(0);
  const searchRequest = useRef(0);
  const recordHeading = useRef<HTMLHeadingElement>(null);
  const create = createAction === "new-household";
  const setQuery = (value: string) => navigate({ q: value }, true);
  const setCreate = (value: boolean) =>
    navigate({
      action: value ? "new-household" : "",
      household: "",
      section: "",
      form: "",
    });
  const back = () =>
    navigate({ household: "", action: "", section: "", form: "" });
  const memberAction = detail?.people.some(
    (p) =>
      `${text(p, "name")} · ${p.learner_id ? text(p, "level") : "Contact only"}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") === createAction,
  );
  const recordSection =
    memberAction ||
    form.startsWith("save-person") ||
    form.startsWith("save-relationship")
      ? "members"
      : form.startsWith("add-note") || form.startsWith("add-follow-up")
        ? "work"
        : ["summary", "members", "work", "activity"].includes(section)
          ? section
          : "summary";
  async function load() {
    const request = ++searchRequest.current;
    setListLoading(true);
    setListError("");
    try {
      const [nextRows, nextViews] = await Promise.all([
        t.read<Row[]>("households", "?q=" + encodeURIComponent(query)),
        t.read<Row[]>("saved-views"),
      ]);
      if (request === searchRequest.current) {
        setRows(nextRows);
        setViews(nextViews);
      }
    } catch (e) {
      if (request === searchRequest.current) setListError((e as Error).message);
    } finally {
      if (request === searchRequest.current) setListLoading(false);
    }
  }
  useEffect(() => {
    setListLoading(true);
    const timeout = setTimeout(() => void load(), 200);
    return () => {
      clearTimeout(timeout);
      searchRequest.current++;
    };
  }, [t.read, query]);
  useEffect(() => {
    let active = true;
    setDetail((previous) =>
      previous?.household.id === householdId ? previous : null,
    );
    setDetailError("");
    if (householdId)
      t.read<Detail>("household", "?id=" + encodeURIComponent(householdId))
        .then((value) => {
          if (active) setDetail(value);
        })
        .catch((e) => {
          if (active) setDetailError(e.message);
        });
    return () => {
      active = false;
    };
  }, [householdId, t.read, revision]);
  useEffect(() => {
    recordHeading.current?.focus();
  }, [detail?.household.id, create]);
  async function open(id: string) {
    navigate({ household: id, action: "", form: "", section: "summary" });
  }
  async function refreshDetail() {
    await load();
    setRevision((value) => value + 1);
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
      {!create && !householdId && (
        <>
          <PageActions>
            <button className="button primary" onClick={() => setCreate(true)}>
              <Plus size={16} aria-hidden="true" /> New household
            </button>
          </PageActions>
          <div className="toolbar household-search">
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="Search households"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search family or learner name"
              />
            </label>
            <button
              className="text-button"
              onClick={() =>
                t
                  .command("view.save", {
                    name: query || "All households",
                    query,
                  })
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
        </>
      )}
      {create && (
        <section className="panel household-create">
          <BackLink onClick={back}>All households</BackLink>
          <h2 ref={recordHeading} tabIndex={-1}>
            New household
          </h2>
          <p className="fine">
            Add everyone learning with your school. Choose one person for school
            updates and one for billing. Learners who share a phone number stay
            separate.
          </p>
          <WorkflowForm
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
                setPrimary(0);
                setBilling(0);
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
                <Plus size={16} /> Add family member
              </button>
              <button className="button primary" disabled={t.busy}>
                Create household
              </button>
            </div>
          </WorkflowForm>
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
      {!create && !householdId && (
        <section
          className="household-directory"
          aria-label="Household directory"
          aria-busy={listLoading}
        >
          <div className="directory-caption">
            <strong>
              {listLoading
                ? "Finding households…"
                : `${rows.length} household${rows.length === 1 ? "" : "s"}`}
            </strong>
            {query && <span>Search results</span>}
          </div>
          {listError ? (
            <div className="directory-empty" role="alert">
              <h3>We couldn’t load the families</h3>
              <p>{listError}</p>
              <button onClick={() => void load()}>Try again</button>
            </div>
          ) : (
            <>
              <div className="directory-columns" aria-hidden="true">
                <span>Household</span>
                <span>Primary contact</span>
                <span>Learners</span>
                <span>Status</span>
              </div>
              {!listLoading &&
                rows.map((h) => (
                  <button
                    type="button"
                    className="household-row"
                    key={h.id}
                    onClick={() => void open(h.id)}
                    aria-label={`Open ${text(h, "name")}`}
                  >
                    <span className="family-identity">
                      <Initials name={text(h, "name")} />
                      <strong>{text(h, "name")}</strong>
                    </span>
                    <span className="family-contact">
                      <span>
                        {text(h, "contact_name") || "No primary contact"}
                      </span>
                      <small>
                        {phone(text(h, "phone")) ||
                          text(h, "email") ||
                          "Contact details not provided"}
                      </small>
                    </span>
                    <span className="family-count">
                      {num(h, "learner_count")}{" "}
                      <span>
                        {num(h, "learner_count") === 1 ? "learner" : "learners"}
                      </span>
                    </span>
                    <span className="family-status">
                      <StatusPill
                        status={h.archived_at ? "archived" : "active"}
                        usual="active"
                      />
                      <ChevronRight size={16} aria-hidden="true" />
                    </span>
                  </button>
                ))}
              {!listLoading && !rows.length && (
                <div className="directory-empty">
                  <EmptyArt name="welcome" />
                  <h3>
                    {query
                      ? "No families match your search"
                      : "Welcome your first family"}
                  </h3>
                  <p>
                    {query
                      ? "Try a different family or learner name."
                      : "Create a household to keep contacts and each learner’s progress together."}
                  </p>
                  <button
                    className="button primary"
                    onClick={() => (query ? setQuery("") : setCreate(true))}
                  >
                    {query ? "Clear search" : "New household"}
                  </button>
                </div>
              )}
              {listLoading && (
                <p className="directory-loading" role="status">
                  Loading school records…
                </p>
              )}
            </>
          )}
        </section>
      )}
      {!create && householdId && !detail && (
        <section className="panel">
          <BackLink onClick={back}>All households</BackLink>
          {detailError ? (
            <div role="alert">
              <p>{detailError}</p>
              <button onClick={() => setRevision((v) => v + 1)}>
                Try again
              </button>
            </div>
          ) : (
            <p role="status">Opening household…</p>
          )}
        </section>
      )}
      {!create && detail && householdId && (
        <section
          className="household-record"
          data-route-resource={detail.household.id}
        >
          <BackLink onClick={back}>All households</BackLink>
          <header className="family-header">
            <Initials name={text(detail.household, "name")} />
            <div>
              <h2 ref={recordHeading} tabIndex={-1}>
                {text(detail.household, "name")}
              </h2>
              <p>
                {plural(
                  detail.people.filter((p) => p.learner_id).length,
                  "learner",
                )}{" "}
                · {plural(detail.people.length, "family member")}
              </p>
            </div>
            <div className="class-record-actions">
              <StatusPill
                status={detail.household.archived_at ? "archived" : "active"}
                usual="active"
              />
              <button
                className="button secondary"
                onClick={() =>
                  openWorkflow("Edit household details", { section: "summary" })
                }
              >
                Edit details
              </button>
            </div>
          </header>
          <nav className="record-nav" aria-label="Household sections">
            {[
              ["summary", "Overview"],
              ["members", "Family members"],
              ["work", "Notes & follow-ups"],
              ["activity", "Activity"],
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-current={recordSection === id ? "page" : undefined}
                onClick={() => navigate({ section: id, action: "", form: "" })}
              >
                {label}
              </button>
            ))}
          </nav>
          <div hidden={recordSection !== "summary"}>
            <div className="contact-summary">
              {[
                ["Primary contact", "primary_person_id"],
                ["Billing contact", "billing_person_id"],
              ].map(([label, key]) => {
                const person = detail.people.find(
                  (p) => p.id === detail.household[key],
                );
                return (
                  <article key={key}>
                    <span className="eyebrow">{label}</span>
                    <h3>{person ? text(person, "name") : "Not assigned"}</h3>
                    <p>
                      {person
                        ? phone(text(person, "phone")) ||
                          text(person, "email") ||
                          "No contact details"
                        : "Choose a family member below."}
                    </p>
                    {person && !!person.contact_opt_out && (
                      <Badge>Messages opted out</Badge>
                    )}
                  </article>
                );
              })}
            </div>
            <WorkflowPanel
              title="Edit household details"
              context={{ section: "summary" }}
            >
              <WorkflowForm
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
              </WorkflowForm>
            </WorkflowPanel>
            <p className="record-help">
              One contact can receive updates for the family. Each learner keeps
              their own lessons, attendance and feedback.
            </p>
          </div>
          <div hidden={recordSection !== "members"}>
            <h3 className="pending-title">Family members</h3>
            <p className="fine">
              Open a member to update their contact details and learning level.
            </p>
            {detail.people.map((p) => (
              <WorkflowDetails
                className="member-detail"
                context={{ section: "members" }}
                key={p.id}
                data-route-resource={p.id}
              >
                <summary>
                  {text(p, "name")} ·{" "}
                  {p.learner_id ? text(p, "level") : "Contact only"}
                </summary>
                <WorkflowForm
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
                    <input
                      name="name"
                      required
                      defaultValue={text(p, "name")}
                    />
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
                </WorkflowForm>
              </WorkflowDetails>
            ))}
            <div className="relationship-panel">
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
              <WorkflowForm
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
              </WorkflowForm>
            </div>
          </div>
          <div hidden={recordSection !== "work"}>
            <div className="record-work-grid">
              <section className="record-work-panel">
                <h3>Internal notes</h3>
                <p className="fine">Visible to authorised school staff.</p>
                {detail.notes.map((n) => (
                  <p key={n.id} className="note">
                    {text(n, "text")}
                  </p>
                ))}
                <WorkflowForm
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const saved = await t.command("household.note", {
                      id: detail.household.id,
                      text: note,
                    });
                    if (saved !== undefined) setNote("");
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
                </WorkflowForm>
              </section>
              <section className="record-work-panel">
                <h3>Follow-ups</h3>
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
                <WorkflowForm
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const saved = await t.command("household.task", {
                      id: detail.household.id,
                      title: task,
                      due,
                    });
                    if (saved !== undefined) setTask("");
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
                </WorkflowForm>
              </section>
            </div>
          </div>
          <div
            hidden={recordSection !== "activity"}
            className="record-activity"
          >
            <h3>Activity</h3>
            {detail.activity.map((a, i) => (
              <p className="fine" key={i}>
                {statusLabel(text(a, "action").replace(/[._]+/g, " "))} ·{" "}
                {formatWhen(text(a, "created_at"), "dayTime")}
              </p>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
