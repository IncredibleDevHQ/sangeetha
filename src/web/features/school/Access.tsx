import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import PhoneInput from "../auth/PhoneInput";
import { WorkflowForm } from "../../components/WorkflowForm";
import { Badge, dateLabel } from "../../components/ui";
import { navigate, useRouteValue } from "../../routes";
import { Select, text, type Row, type SchoolTools } from "./common";

const roles = [
  {
    id: "classes.teach",
    name: "Assigned teacher",
    scope: "Batch",
    description: "Conduct classes and mark attendance for the selected batch.",
    boundary:
      "Does not grant school-wide scheduling, finance or administrator access.",
  },
  {
    id: "assessments.review",
    name: "Test Reviewer",
    scope: "Test",
    description:
      "Listen to submissions and prepare scores and passage feedback for one test.",
    boundary:
      "Draft feedback needs authorised publication. Other tests and school finances stay separate.",
  },
  {
    id: "portal.learn",
    name: "Learner / guardian",
    scope: "Learner",
    description:
      "Open published lessons, practice and tests for the selected learner.",
    boundary:
      "Add a separate grant for each child or adult learner. Household payments require their own role.",
  },
  {
    id: "household.billing",
    name: "Household billing",
    scope: "Household",
    description:
      "View this family's statement, report payments and register family event participation.",
    boundary:
      "Does not grant the household's learning records or permission to verify payments.",
  },
  {
    id: "curriculum.manage",
    name: "Curriculum Creator",
    scope: "School",
    description:
      "Create, organise and publish lessons and teaching materials across the school curriculum.",
    boundary:
      "Does not grant finance, team management or test-review permissions.",
  },
  {
    id: "finance.manage",
    name: "Finance operator",
    scope: "School",
    description:
      "Manage school charges, verify payments, allocate receipts and handle financial corrections.",
    boundary:
      "This covers the whole school's finances. It does not grant administrator or teaching permissions.",
  },
] as const;
type AccessData = { grants: Row[]; invitations: Row[] };
type Roster = { batches: Row[]; learners: Row[] };

export function AccessView({ tools }: { tools: SchoolTools }) {
  const [data, setData] = useState<AccessData>({ grants: [], invitations: [] }),
    [roster, setRoster] = useState<Roster>({ batches: [], learners: [] }),
    [households, setHouseholds] = useState<Row[]>([]),
    [tests, setTests] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [cap, setCap] = useState<string>("classes.teach"),
    [channel, setChannel] = useState("email"),
    [resource, setResource] = useState("");
  const [action] = useRouteValue("action"),
    [form] = useRouteValue("form"),
    [view, setView] = useRouteValue("status", "active"),
    [query, setQuery] = useRouteValue("q"),
    [selected] = useRouteValue("grant");
  const request = useRef(0),
    heading = useRef<HTMLHeadingElement>(null);
  const composing =
    action === "invite-access" || form === "create-access-invitation";
  async function load() {
    const id = ++request.current;
    setLoading(true);
    setError("");
    try {
      const [access, people, families, assessments] = await Promise.all([
        tools.read<AccessData>("grants"),
        tools.read<Roster>("roster"),
        tools.read<Row[]>("households"),
        tools.read<{ tests: Row[] }>("tests"),
      ]);
      if (id === request.current) {
        setData(access);
        setRoster(people);
        setHouseholds(families);
        setTests(assessments.tests);
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
    if (!loading) heading.current?.focus();
  }, [loading, composing, selected]);
  const rowsFor = (capability: string) =>
    capability === "classes.teach"
      ? roster.batches
      : capability === "portal.learn"
        ? [...new Map(roster.learners.map((r) => [r.id, r])).values()]
        : capability === "household.billing"
          ? households
          : capability === "assessments.review"
            ? tests
            : [{ id: tools.school.id, name: tools.school.name }];
  const scopeName = (grant: Row) => {
    const row = rowsFor(text(grant, "capability")).find(
      (r) => r.id === grant.resource_id,
    );
    return row
      ? text(row, grant.capability === "assessments.review" ? "title" : "name")
      : "Unavailable record";
  };
  const roleFor = (id: string) => roles.find((r) => r.id === id);
  const role = roleFor(cap)!;
  const availableScopes = rowsFor(cap).filter((r) => !r.archived_at);
  const close = () => {
    tools.setError("");
    navigate({ action: "", form: "", grant: "" });
  };
  const invitations = data.invitations.filter(
    (i) => new Date(text(i, "expires_at")).getTime() > Date.now(),
  );
  const records = view === "pending" ? invitations : data.grants;
  const shown = records.filter((r) =>
    `${text(r, "display_name")} ${text(r, "destination")} ${roleFor(text(r, "capability"))?.name || text(r, "capability")} ${scopeName(r)}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  const current = records.find((r) => r.id === selected);
  if (loading)
    return (
      <p className="ui-empty" role="status">
        Loading roles and invitations…
      </p>
    );
  if (error)
    return (
      <div className="ui-empty" role="alert">
        <h2>We couldn’t load access records</h2>
        <p>{error}</p>
        <button onClick={() => void load()}>Try again</button>
      </div>
    );
  if (composing)
    return (
      <section className="access-workspace">
        <button className="back-link" onClick={close}>
          <ArrowLeft size={16} /> Back to roles
        </button>
        <div className="access-heading">
          <div>
            <span className="eyebrow">Invite someone to help</span>
            <h2 ref={heading} tabIndex={-1}>
              The right role, for the right person
            </h2>
            <p>
              Choose their work and scope, then the identity they use to sign
              in.
            </p>
          </div>
        </div>
        <WorkflowForm
          className="access-composer"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            if (
              await tools.command("grant.invite", {
                channel,
                destination: f.get("destination"),
                capability: cap,
                resource,
              })
            ) {
              await load();
              navigate({
                action: "",
                form: "",
                grant: "",
                status: "pending",
                q: "",
              });
              setResource("");
              setCap("classes.teach");
              setChannel("email");
            }
          }}
        >
          <div className="access-fields">
            <h3>1. Choose the work</h3>
            <label>
              Role
              <select
                value={cap}
                onChange={(e) => {
                  const next = e.target.value;
                  setCap(next);
                  setResource(
                    ["finance.manage", "curriculum.manage"].includes(next)
                      ? tools.school.id
                      : "",
                  );
                }}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="access-role-explanation">
              <ShieldCheck size={20} />
              <div>
                <strong>{role.name}</strong>
                <p>{role.description}</p>
                <p>{role.boundary}</p>
              </div>
            </div>
            {role.scope === "School" ? (
              <p className="access-school-scope">
                <strong>School-wide scope</strong>
                <span>{tools.school.name}</span>
              </p>
            ) : (
              <Select
                label={role.scope}
                value={resource}
                onChange={setResource}
                rows={availableScopes}
                labelKey={cap === "assessments.review" ? "title" : "name"}
              />
            )}
            {!availableScopes.length && (
              <p className="access-hint">
                Create a {role.scope.toLowerCase()} before inviting someone to
                this role.
              </p>
            )}
          </div>
          <div className="access-fields">
            <h3>2. Identify the person</h3>
            <label>
              Sign-in method
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
              >
                <option value="email">Google email</option>
                <option value="phone">Phone OTP</option>
              </select>
            </label>
            {channel === "phone" ? (
              <PhoneInput label="Verified phone" name="destination" required />
            ) : (
              <label>
                Verified email
                <input
                  key="email"
                  type="email"
                  name="destination"
                  required
                  autoComplete="off"
                  placeholder="person@example.com"
                />
              </label>
            )}
            <p className="access-hint">
              The invitation matches this verified sign-in identity and expires
              in seven days. A shared family contact does not grant access
              automatically.
            </p>
          </div>
          <div className="access-composer-actions">
            <button
              className="button primary"
              disabled={
                !resource || !availableScopes.some((r) => r.id === resource)
              }
            >
              Create access invitation
            </button>
            <button type="button" className="button secondary" onClick={close}>
              Cancel
            </button>
          </div>
        </WorkflowForm>
      </section>
    );
  if (selected)
    return (
      <section className="access-workspace">
        <button className="back-link" onClick={close}>
          <ArrowLeft size={16} /> All access records
        </button>
        {!current ? (
          <div className="ui-empty">
            <h2 ref={heading} tabIndex={-1}>
              Access record unavailable
            </h2>
            <p>
              It may have expired, been accepted or been revoked. Return to the
              list for current records.
            </p>
          </div>
        ) : (
          <>
            <div className="access-heading">
              <div>
                <span className="eyebrow">
                  {view === "pending" ? "Pending invitation" : "Active access"}
                </span>
                <h2 ref={heading} tabIndex={-1}>
                  {text(
                    current,
                    view === "pending" ? "destination" : "display_name",
                  ) || "School member"}
                </h2>
                <p>
                  {roleFor(text(current, "capability"))?.name ||
                    text(current, "capability")}{" "}
                  · {scopeName(current)}
                </p>
              </div>
              <Badge tone={view === "pending" ? "neutral" : "success"}>
                {view === "pending" ? "Awaiting sign-in" : "Active"}
              </Badge>
            </div>
            <div className="access-detail">
              <ShieldCheck size={24} />
              <h3>{roleFor(text(current, "capability"))?.name}</h3>
              <p>{roleFor(text(current, "capability"))?.description}</p>
              <p>{roleFor(text(current, "capability"))?.boundary}</p>
              <dl>
                <div>
                  <dt>Scope</dt>
                  <dd>{scopeName(current)}</dd>
                </div>
                {view === "pending" && (
                  <div>
                    <dt>Expires</dt>
                    <dd>{dateLabel(text(current, "expires_at"))}</dd>
                  </div>
                )}
              </dl>
              <details className="access-revoke">
                <summary>
                  {view === "pending"
                    ? "Revoke invitation"
                    : "Revoke this access"}
                </summary>
                <p>
                  {view === "pending"
                    ? "This invitation will no longer be accepted when the person signs in."
                    : "This role and scope will be removed. Any other roles the person holds are unchanged."}
                </p>
                <button
                  className="button secondary"
                  onClick={async () => {
                    if (
                      await tools.command("grant.revoke", {
                        id: current.id,
                        invitation: view === "pending",
                      })
                    ) {
                      await load();
                      close();
                    }
                  }}
                >
                  {view === "pending"
                    ? "Confirm revoke invitation"
                    : "Confirm revoke access"}
                </button>
              </details>
            </div>
          </>
        )}
      </section>
    );
  return (
    <section className="access-workspace">
      <div className="access-heading">
        <div>
          <span className="eyebrow">Everyone has a part to play</span>
          <h2 ref={heading} tabIndex={-1}>
            Roles, with clear boundaries
          </h2>
          <p>
            Manage teachers, reviewers, curriculum creators and family access.
          </p>
        </div>
        <button
          className="button primary"
          onClick={() =>
            navigate({ action: "invite-access", form: "", grant: "" })
          }
        >
          <Plus size={16} /> Invite a person
        </button>
      </div>
      <div className="access-toolbar">
        <div className="segmented" role="group" aria-label="Access status">
          <button
            aria-pressed={view !== "pending"}
            onClick={() => setView("active")}
          >
            Active roles · {data.grants.length}
          </button>
          <button
            aria-pressed={view === "pending"}
            onClick={() => setView("pending")}
          >
            Pending invitations · {invitations.length}
          </button>
        </div>
        <label className="access-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search access records"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, roles or scopes"
          />
        </label>
      </div>
      {!shown.length ? (
        <div className="ui-empty">
          <ShieldCheck size={28} />
          <h3>
            {query.trim()
              ? "No matching access records"
              : view === "pending"
                ? "No pending invitations"
                : "Build your school team"}
          </h3>
          <p>
            {query.trim()
              ? "Try another person, role or scope."
              : view === "pending"
                ? "New invitations appear here until accepted, revoked or expired."
                : "Invite someone to a specific role, or give a family access to their learner's portal."}
          </p>
          {query.trim() && (
            <button onClick={() => setQuery("")}>Clear search</button>
          )}
        </div>
      ) : (
        <div className="access-records">
          {shown.map((r) => (
            <button
              key={r.id}
              className="access-record"
              onClick={() => navigate({ grant: r.id, action: "", form: "" })}
            >
              <span className="access-avatar">
                {view === "pending" ? (
                  <Mail size={20} />
                ) : (
                  <UserRound size={20} />
                )}
              </span>
              <span className="access-record-person">
                <strong>
                  {text(
                    r,
                    view === "pending" ? "destination" : "display_name",
                  ) || "School member"}
                </strong>
                <span>
                  {roleFor(text(r, "capability"))?.name ||
                    text(r, "capability")}
                </span>
                <small>{scopeName(r)}</small>
              </span>
              <span className="access-record-state">
                {view === "pending"
                  ? `Expires ${dateLabel(text(r, "expires_at"))}`
                  : "Active"}
              </span>
              <ArrowUpRight size={17} />
            </button>
          ))}
        </div>
      )}
      <aside className="access-admin-note">
        <ShieldCheck size={19} />
        <div>
          <strong>Adding an administrator?</strong>
          <p>
            School administrators have broader operational access. Manage them
            separately in Team & access.
          </p>
          <button
            className="button secondary"
            onClick={() => navigate({ page: "team" })}
          >
            Open admin team <ArrowUpRight size={14} />
          </button>
        </div>
      </aside>
    </section>
  );
}
