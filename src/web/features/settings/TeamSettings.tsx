import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { Team } from "../../contracts";
import { api } from "../../lib/api";
import { navigate, useRouteValue } from "../../routes";
import { Badge } from "../../components/ui";
import { WorkflowForm } from "../../components/WorkflowForm";
import PhoneInput from "../auth/PhoneInput";
import "./Settings.css";

export default function TeamSettings({
  school,
}: {
  school: { id: string; name: string };
}) {
  const [team, setTeam] = useState<Team | null>(null),
    [loading, setLoading] = useState(true),
    [refreshFailed, setRefreshFailed] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [action] = useRouteValue("action"),
    [form] = useRouteValue("form"),
    [view] = useRouteValue("teamView", "members"),
    [record] = useRouteValue("record"),
    [query, setQuery] = useRouteValue("q");
  const [channel, setChannel] = useState("email"),
    [destination, setDestination] = useState("");
  const request = useRef(0),
    heading = useRef<HTMLHeadingElement>(null),
    actionHeading = useRef<HTMLHeadingElement>(null);
  const composing =
    action === "invite-administrator" || form === "create-invitation";
  const revoking =
    action === "revoke-administrator" ||
    action === "cancel-administrator-invitation";
  async function load() {
    const version = ++request.current;
    setLoading(true);
    setError("");
    try {
      const data = await api<Team>(`/schools/${school.id}/team`);
      if (version === request.current) {
        setRefreshFailed(false);
        setTeam({
          ...data,
          members: data.members.filter(
            (m) => m.role === "owner" || m.role === "admin",
          ),
        });
      }
    } catch (e) {
      if (version === request.current) {
        setRefreshFailed(true);
        setError((e as Error).message);
      }
    } finally {
      if (version === request.current) setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      request.current++;
    };
  }, [school.id]);
  useEffect(() => {
    (actionHeading.current || heading.current)?.focus();
  }, [action, record, view, loading]);
  const go = (values: Record<string, string>) => {
    setError("");
    setMessage("");
    navigate(values);
  };
  async function act(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      await load();
      navigate({ action: "", form: "", record: "" });
      setMessage(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const member = team?.members.find((m) => m.id === record),
    invitation = team?.invitations.find((i) => i.id === record);
  const list = () => go({ action: "", form: "", record: "" });
  return (
    <section className="settings-workspace">
      <div className="page-heading">
        <span className="eyebrow">Trusted people · {school.name}</span>
        <h1>Team & access</h1>
        <p>Your school’s administrators, with access kept explicit.</p>
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      {!team || refreshFailed ? (
        <div className="settings-empty">
          {loading ? (
            <p role="status">Loading your team…</p>
          ) : (
            <>
              <h2 ref={heading} tabIndex={-1}>
                {team ? "Couldn’t refresh the team" : "Team unavailable"}
              </h2>
              {message && (
                <p>
                  Your change is saved. Retry loading the latest access records.
                </p>
              )}
              <button className="button secondary" onClick={() => void load()}>
                Try again
              </button>
            </>
          )}
        </div>
      ) : (
        <fieldset disabled={busy} className="settings-body">
          {composing ? (
            <>
              <button className="settings-back" onClick={list}>
                <ArrowLeft size={15} /> All administrators
              </button>
              <div className="settings-columns">
                <WorkflowForm
                  className="settings-card settings-form"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (
                      await act(
                        () =>
                          api(`/schools/${school.id}/invitations`, "POST", {
                            channel,
                            destination,
                          }),
                        "Invitation created. Share the school sign-in address with the administrator.",
                      )
                    ) {
                      setDestination("");
                      navigate({ teamView: "invitations", q: "" });
                    }
                  }}
                >
                  <span className="settings-icon">
                    <ShieldCheck size={22} />
                  </span>
                  <h2 ref={heading} tabIndex={-1}>
                    Invite an administrator
                  </h2>
                  <p className="settings-description">
                    Administrators manage school operations across this school.
                    Only the owner can manage administrator access.
                  </p>
                  <label>
                    Sign-in method
                    <select
                      value={channel}
                      onChange={(e) => {
                        setChannel(e.target.value);
                        setDestination("");
                      }}
                    >
                      <option value="email">Google email</option>
                      <option value="phone">Phone</option>
                    </select>
                  </label>
                  {channel === "phone" ? (
                    <PhoneInput
                      value={destination}
                      onChange={setDestination}
                      required
                    />
                  ) : (
                    <label>
                      Google email address
                      <input
                        type="email"
                        required
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        placeholder="admin@example.com"
                      />
                    </label>
                  )}
                  <p className="settings-hint">
                    The invitation matches this verified sign-in identity and
                    expires after seven days. It is recorded here; an email or
                    WhatsApp message is not sent automatically.
                  </p>
                  <div className="settings-actions">
                    <button
                      className="button primary"
                      disabled={busy || !destination.trim()}
                    >
                      <Plus size={16} />
                      {busy ? "Creating invitation…" : "Create invitation"}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={list}
                    >
                      Cancel
                    </button>
                  </div>
                </WorkflowForm>
                <aside className="settings-help">
                  <Users size={22} />
                  <h3>Teaching duties only?</h3>
                  <p>
                    Use a specialist role for a curriculum creator, test
                    reviewer, assigned teacher or finance operator. Each role
                    can have a narrower resource scope.
                  </p>
                  <button
                    className="button secondary"
                    onClick={() => go({ page: "operations", module: "access" })}
                  >
                    Open specialist roles <ArrowUpRight size={14} />
                  </button>
                </aside>
              </div>
            </>
          ) : record ? (
            <>
              <button className="settings-back" onClick={list}>
                <ArrowLeft size={15} /> All administrators
              </button>
              {member || invitation ? (
                <article className="settings-card settings-record">
                  <span className="settings-icon">
                    {member ? <ShieldCheck size={23} /> : <Mail size={23} />}
                  </span>
                  <h2 ref={heading} tabIndex={-1}>
                    {member?.display_name || invitation?.destination}
                  </h2>
                  <Badge tone="neutral">
                    {member?.role || "Invitation pending"}
                  </Badge>
                  <dl>
                    <div>
                      <dt>School</dt>
                      <dd>{school.name}</dd>
                    </div>
                    <div>
                      <dt>Access</dt>
                      <dd>
                        {member?.role === "owner"
                          ? "School owner"
                          : "School administrator"}
                      </dd>
                    </div>
                    {invitation && (
                      <>
                        <div>
                          <dt>Sign in using</dt>
                          <dd>
                            {invitation.channel === "phone"
                              ? "Phone OTP"
                              : "Google"}
                          </dd>
                        </div>
                        <div>
                          <dt>Invitation expires</dt>
                          <dd>
                            {new Date(invitation.expires_at).toLocaleString()}
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                  {member?.role === "owner" ? (
                    <p className="settings-hint">
                      Owner access cannot be revoked from this screen.
                    </p>
                  ) : revoking ? (
                    <div className="settings-danger">
                      <h3 ref={actionHeading} tabIndex={-1}>
                        {invitation
                          ? "Cancel this invitation?"
                          : "Revoke administrator access?"}
                      </h3>
                      <p>
                        {invitation
                          ? "This pending invitation will no longer grant administrator access when the person signs in."
                          : "This person will lose administrator access to this school. Their account, school records and separately assigned specialist roles are retained."}
                      </p>
                      <div className="settings-actions">
                        <button
                          className="button danger"
                          onClick={() =>
                            void act(
                              () =>
                                api(
                                  `/schools/${school.id}/${invitation ? "invitations" : "members"}/${record}`,
                                  "DELETE",
                                  {},
                                ),
                              invitation
                                ? "Invitation cancelled."
                                : "Administrator access revoked.",
                            )
                          }
                        >
                          {invitation
                            ? "Confirm cancellation"
                            : "Confirm revocation"}
                        </button>
                        <button
                          className="button secondary"
                          onClick={() => go({ action: "" })}
                        >
                          Keep access
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="text-button danger"
                      onClick={() =>
                        go({
                          action: invitation
                            ? "cancel-administrator-invitation"
                            : "revoke-administrator",
                        })
                      }
                    >
                      {invitation
                        ? "Cancel invitation"
                        : "Revoke administrator access"}
                    </button>
                  )}
                </article>
              ) : (
                <div className="settings-empty">
                  <h2>Access record unavailable</h2>
                  <p>It may have been revoked, claimed or expired.</p>
                  <button className="button secondary" onClick={list}>
                    Back to team
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="settings-toolbar">
                <div>
                  <h2 ref={heading} tabIndex={-1}>
                    School administrators
                  </h2>
                  <p>
                    Invite people who need to manage the school’s daily
                    operations.
                  </p>
                </div>
                <div className="settings-actions">
                  <button
                    className="button secondary"
                    disabled={loading}
                    onClick={() => void load()}
                    aria-label="Refresh team"
                  >
                    <RefreshCw size={16} />
                  </button>
                  <button
                    className="button primary"
                    onClick={() =>
                      go({
                        action: "invite-administrator",
                        form: "",
                        record: "",
                      })
                    }
                  >
                    <Plus size={16} /> Invite administrator
                  </button>
                </div>
              </div>
              <div className="settings-filters">
                <div className="settings-tabs" aria-label="Team lists">
                  {[
                    ["members", "Active team", team.members.length],
                    [
                      "invitations",
                      "Pending invitations",
                      team.invitations.length,
                    ],
                  ].map(([id, label, count]) => (
                    <button
                      key={id}
                      aria-pressed={view === id}
                      onClick={() =>
                        go({
                          teamView: String(id),
                          record: "",
                          action: "",
                          form: "",
                        })
                      }
                    >
                      {label} <span>{count}</span>
                    </button>
                  ))}
                </div>
                <label className="settings-search">
                  <Search size={16} />
                  <input
                    type="search"
                    aria-label="Search administrators"
                    placeholder="Find a person or invitation"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="settings-list" aria-busy={loading}>
                {view === "invitations"
                  ? team.invitations
                      .filter((i) =>
                        i.destination
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((i) => (
                        <button key={i.id} onClick={() => go({ record: i.id })}>
                          <span className="settings-avatar">
                            {i.channel === "phone" ? (
                              <Phone size={20} />
                            ) : (
                              <Mail size={20} />
                            )}
                          </span>
                          <span className="settings-person">
                            <strong>{i.destination}</strong>
                            <small>
                              Expires{" "}
                              {new Date(i.expires_at).toLocaleDateString()}
                            </small>
                          </span>
                          <Badge tone="neutral">Pending</Badge>
                          <ArrowUpRight size={15} />
                        </button>
                      ))
                  : team.members
                      .filter((m) =>
                        (m.display_name + " " + m.role)
                          .toLowerCase()
                          .includes(query.toLowerCase()),
                      )
                      .map((m) => (
                        <button key={m.id} onClick={() => go({ record: m.id })}>
                          <span className="settings-avatar">
                            {m.display_name.slice(0, 1)}
                          </span>
                          <span className="settings-person">
                            <strong>{m.display_name}</strong>
                            <small>
                              {m.role === "owner"
                                ? "Manages this school and its access"
                                : "School operations"}
                            </small>
                          </span>
                          <Badge tone="neutral">{m.role}</Badge>
                          <ArrowUpRight size={15} />
                        </button>
                      ))}
              </div>
              {!(view === "invitations"
                ? team.invitations.some((i) =>
                    i.destination.toLowerCase().includes(query.toLowerCase()),
                  )
                : team.members.some((m) =>
                    (m.display_name + " " + m.role)
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )) && (
                <div className="settings-empty">
                  <Users size={28} />
                  <h3>
                    {query
                      ? "No matching people"
                      : view === "invitations"
                        ? "No pending invitations"
                        : "No active administrators"}
                  </h3>
                  <p>
                    {query
                      ? "Try another name or sign-in identity."
                      : "Administrator invitations will appear here until claimed, cancelled or expired."}
                  </p>
                  {query && (
                    <button
                      className="button secondary"
                      onClick={() => setQuery("")}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              )}
              <p className="settings-hint">
                Curriculum creators, test reviewers and assigned teachers are
                managed in{" "}
                <button
                  className="text-button"
                  onClick={() => go({ page: "operations", module: "access" })}
                >
                  Roles & invitations
                </button>
                .
              </p>
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
