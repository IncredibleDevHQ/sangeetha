import SchoolWorkspace from "./features/school/Workspace";
import type { Me, Team } from "./contracts";
import { api, ApiError } from "./lib/api";
import SignIn from "./features/auth/SignIn";
import { useEffect, useState } from "react";
import {
  Music2,
  LayoutDashboard,
  Users,
  ShieldCheck,
  LogOut,
  ArrowRight,
  Phone,
  Mail,
  Check,
  Settings,
  CalendarDays,
  Wallet,
  BookOpen,
  Plus,
  X,
} from "lucide-react";
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Music2 size={22} />
      </span>
      <span>
        Sangeetha<small>MUSIC SCHOOL WORKSPACE</small>
      </span>
    </div>
  );
}
export default function App() {
  const [tenantName, setTenantName] = useState("");
  const [me, setMe] = useState<Me | null>(null),
    [loaded, setLoaded] = useState(false),
    [local, setLocal] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState("overview"),
    [schoolId, setSchoolId] = useState(""),
    [team, setTeam] = useState<Team | null>(null),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState(false),
    [name, setName] = useState(""),
    [channel, setChannel] = useState("email"),
    [destination, setDestination] = useState("");
  const school = me?.schools.find((s) => s.id === schoolId) || me?.schools[0];
  async function refresh() {
    try {
      const next = await api<Me>("/me");
      setMe(next);
      setName(next.account.displayName);
    } catch (e) {
      if ((e as ApiError).status === 401) setMe(null);
      else throw e;
    }
  }
  useEffect(() => {
    Promise.all([
      api<{ mode: string; school?: { name: string } }>("/auth/config").then(
        (c) => {
          setLocal(c.mode === "local");
          setTenantName(c.school?.name || "");
        },
      ),
      refresh(),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);
  async function loadTeam() {
    if (school?.role === "owner")
      setTeam(await api<Team>("/schools/" + school.id + "/team"));
  }
  useEffect(() => {
    setTeam(null);
    if (page === "team") loadTeam().catch((e) => setError(e.message));
  }, [page, school?.id]);
  async function act(work: () => Promise<unknown>, message = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
      if (page === "team") await loadTeam();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
      if ((e as ApiError).status === 401) await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    await act(async () => {
      await api("/logout", "POST", {});
      setPage("overview");
      setLink(false);
      setTeam(null);
      setSchoolId("");
    });
  }
  const alerts = (
    <>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="success">
          <Check size={16} />
          {notice}
        </div>
      )}
    </>
  );
  if (!loaded) return <main className="loading">Opening Sangeetha…</main>;
  if (!me)
    return (
      <main className="login-layout">
        <section className="login-story">
          <Brand />
          <div className="story-content">
            <span className="eyebrow">MORE MUSIC. LESS ADMIN.</span>
            <h1>
              A calmer rhythm
              <br />
              for your school.
            </h1>
            <p>
              One home for your music school.
              <br />A little more time for what you love teaching.
            </p>
            <div className="staff-lines">
              <span />
              <span />
              <span />
              <span />
              <span />
              <Music2 size={70} />
            </div>
          </div>
          <span className="story-footer">
            Built around your teaching practice.
          </span>
        </section>
        <section className="login-panel">
          <div className="login-card">
            <span className="eyebrow">WELCOME TO SANGEETHA</span>
            <h2>Your school starts here.</h2>
            <p className="subtitle">
              {tenantName
                ? "Sign in to " + tenantName + "."
                : "Sign in to your teacher workspace."}
            </p>
            {alerts}
            <SignIn local={local} onDone={refresh} onError={setError} />
            <p className="access-note">
              <ShieldCheck size={16} />
              School access is by invitation.
            </p>
          </div>
        </section>
      </main>
    );
  return (
    <div className="app-layout">
      <aside>
        <Brand />
        <div className="school-label">YOUR WORKSPACE</div>
        {me.schools.length > 1 ? (
          <select
            aria-label="School"
            value={school?.id}
            onChange={(e) => setSchoolId(e.target.value)}
          >
            {me.schools.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : (
          <div className="school-name">
            {school?.name || "No school access"}
            <span>{school?.role || "Awaiting invitation"}</span>
          </div>
        )}
        <nav>
          {[
            { id: "overview", label: "Overview", icon: LayoutDashboard },
              ...(school?[{id:"operations",label:"School operations",icon:BookOpen}]:[]),
            ...(school?.role === "owner"
              ? [{ id: "team", label: "Team & access", icon: Users }]
              : []),
            { id: "account", label: "My account", icon: Settings },
          ].map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              onClick={() => {
                setPage(item.id);
                setError("");
                setNotice("");
              }}
            >
              <item.icon size={19} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">
            {me.account.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            {me.account.displayName}
            <small>
              {school?.role === "owner" ? "School owner" : "Administrator"}
            </small>
          </div>
          <button aria-label="Sign out" disabled={busy} onClick={signOut}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <span>
            Workspace /{" "}
            {page === "overview"
              ? "Overview"
              : page === "team"
                ? "Team & access"
                : "My account"}
          </span>
          <div className="header-actions">
            <button
              className="mobile-logout"
              aria-label="Sign out on mobile"
              disabled={busy}
              onClick={signOut}
            >
              <LogOut size={17} />
            </button>
            <span className="pill">
              <span className="status-dot" />
              {local ? "Local development" : "Connected"}
            </span>
          </div>
        </header>
        <main className="content">
          {alerts}
          {page === "operations" && school && <SchoolWorkspace key={school.id} school={school}/>}
          {page === "overview" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">YOUR TEACHING PRACTICE</span>
                <h1>
                  Welcome,{" "}
                  {me.account.displayName === "School administrator"
                    ? "teacher"
                    : me.account.displayName.split(" ")[0]}
                  .
                </h1>
                <p>
                  {school
                    ? "Your workspace is ready. Let’s lay a strong foundation."
                    : "You’re signed in. A school owner needs to invite you before you can enter a workspace."}
                </p>
              </div>
              {school ? (
                <>
                  <section className="welcome-banner">
                    <div>
                      <span className="tag">PHASE 1 · FOUNDATION</span>
                      <h2>A place for your whole school.</h2>
                      <p>
                        Start with secure access for yourself and your admin
                        team.
                        <br />
                        Students, classes and fees come next.
                      </p>
                      <button
                        className="button cream"
                        onClick={() =>
                          setPage(school.role === "owner" ? "team" : "account")
                        }
                      >
                        {school.role === "owner"
                          ? "Manage your team"
                          : "Manage your account"}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    <Music2 className="banner-music" size={115} />
                  </section>
                  <div className="section-heading">
                    <h2>Set up your workspace</h2>
                    <span>Available now</span>
                  </div>
                  <div className="setup-grid">
                    <button
                      className="setup-card"
                      onClick={() => setPage("account")}
                    >
                      <ShieldCheck />
                      <h3>Your account</h3>
                      <p>Manage sign-in methods and active sessions.</p>
                      <span>
                        Open account <ArrowRight size={15} />
                      </span>
                    </button>
                    {school.role === "owner" && (
                      <button
                        className="setup-card"
                        onClick={() => setPage("team")}
                      >
                        <Users />
                        <h3>Your admin team</h3>
                        <p>Invite trusted people to help manage your school.</p>
                        <span>
                          Manage access <ArrowRight size={15} />
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="section-heading">
                    <h2>Growing with your school</h2>
                    <span>Coming in later phases</span>
                  </div>
                  <div className="future-grid">
                    {[
                      {
                        icon: Users,
                        title: "Households & students",
                        text: "One family contact. Every learner’s own journey.",
                      },
                      {
                        icon: CalendarDays,
                        title: "Classes & attendance",
                        text: "A reliable schedule for every batch.",
                      },
                      {
                        icon: Wallet,
                        title: "Fees & collections",
                        text: "Clear dues, payments and household statements.",
                      },
                      {
                        icon: BookOpen,
                        title: "Learning & assessments",
                        text: "Recordings, tests and thoughtful feedback.",
                      },
                    ].map((x) => (
                      <div className="future-card" key={x.title}>
                        <x.icon size={20} />
                        <h3>{x.title}</h3>
                        <p>{x.text}</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <section className="panel">
                  <ShieldCheck />
                  <h2>Waiting for an invitation</h2>
                  <p>
                    Ask the owner to invite your verified email or phone number,
                    then sign in again. Signing in does not create a school or
                    grant access.
                  </p>
                </section>
              )}
            </>
          )}
          {page === "team" && school?.role === "owner" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">TRUSTED PEOPLE</span>
                <h1>Team & access</h1>
                <p>Give your admin team a secure place to help.</p>
              </div>
              <section className="panel">
                <h2>Invite an administrator</h2>
                <p className="fine">
                  Admins can enter this school workspace. Only the owner can
                  manage team access. Invitations expire after 7 days.
                </p>
                <form
                  className="invite-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(async () => {
                      await api(
                        "/schools/" + school.id + "/invitations",
                        "POST",
                        { channel, destination },
                      );
                      setDestination("");
                    }, "Invitation created. Share the sign-in address with your administrator.");
                  }}
                >
                  <label>
                    Sign-in method
                    <select
                      value={channel}
                      onChange={(e) => setChannel(e.target.value)}
                    >
                      <option value="email">Google email</option>
                      <option value="phone">Phone · +91</option>
                    </select>
                  </label>
                  <label>
                    {channel === "email" ? "Email address" : "Mobile number"}
                    <input
                      required
                      type={channel === "email" ? "email" : "tel"}
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder={
                        channel === "email"
                          ? "admin@example.com"
                          : "98765 43210"
                      }
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    <Plus size={17} />
                    Create invitation
                  </button>
                </form>
                <p className="fine">
                  Invitations are recorded here; this release does not send
                  WhatsApp or email messages.
                </p>
              </section>
              <section className="panel">
                <h2>School team</h2>
                {!team ? (
                  <p>Loading team…</p>
                ) : (
                  <>
                    {team.members.map((m) => (
                      <div className="list-row" key={m.id}>
                        <div className="avatar">{m.display_name[0]}</div>
                        <div className="row-detail">
                          <strong>{m.display_name}</strong>
                          <small>{m.role}</small>
                        </div>
                        {m.role === "admin" ? (
                          <button
                            className="text-button danger"
                            disabled={busy}
                            onClick={() =>
                              act(
                                () =>
                                  api(
                                    "/schools/" +
                                      school.id +
                                      "/members/" +
                                      m.id,
                                    "DELETE",
                                    {},
                                  ),
                                "School access revoked.",
                              )
                            }
                          >
                            Revoke access
                          </button>
                        ) : (
                          <span className="pill">Owner</span>
                        )}
                      </div>
                    ))}
                    <h3 className="pending-title">Pending invitations</h3>
                    {!team.invitations.length && (
                      <p className="empty">No pending invitations.</p>
                    )}
                    {team.invitations.map((i) => (
                      <div className="list-row" key={i.id}>
                        {i.channel === "email" ? (
                          <Mail size={20} />
                        ) : (
                          <Phone size={20} />
                        )}
                        <div className="row-detail">
                          <strong>{i.destination}</strong>
                          <small>
                            Expires{" "}
                            {new Date(i.expires_at).toLocaleDateString("en-IN")}
                          </small>
                        </div>
                        <button
                          className="text-button danger"
                          disabled={busy}
                          onClick={() =>
                            act(
                              () =>
                                api(
                                  "/schools/" +
                                    school.id +
                                    "/invitations/" +
                                    i.id,
                                  "DELETE",
                                  {},
                                ),
                              "Invitation cancelled.",
                            )
                          }
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </section>
            </>
          )}
          {page === "account" && (
            <>
              <div className="page-heading">
                <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
                <h1>My account</h1>
                <p>Your profile, sign-in methods and devices.</p>
              </div>
              <section className="panel">
                <h2>Profile</h2>
                <form
                  className="profile-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(
                      () => api("/account", "PATCH", { name }),
                      "Profile updated.",
                    );
                  }}
                >
                  <label>
                    Display name
                    <input
                      required
                      minLength={2}
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    Save name
                  </button>
                </form>
              </section>
              <section className="panel">
                <h2>Sign-in methods</h2>
                <p className="fine">
                  Verify a second method to use it with this account. Changes
                  require sign-in within the last 5 minutes and sign out your
                  other devices.
                </p>
                {me.account.identities.map((i) => (
                  <div className="list-row" key={i.provider}>
                    {i.provider === "phone" ? (
                      <Phone size={20} />
                    ) : (
                      <Mail size={20} />
                    )}
                    <div className="row-detail">
                      <strong>
                        {i.provider === "phone" ? "Phone" : "Google"}
                      </strong>
                      <small>{i.label}</small>
                    </div>
                    {me.account.identities.length > 1 && (
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () =>
                              api(
                                "/account/methods/" + i.provider,
                                "DELETE",
                                {},
                              ),
                            "Sign-in method removed.",
                          )
                        }
                      >
                        Remove
                      </button>
                    )}
                    <span className="verified">
                      <Check size={14} />
                      Verified
                    </span>
                  </div>
                ))}
                <button
                  className="text-button add-method"
                  onClick={() => {
                    setLink(!link);
                    setError("");
                  }}
                >
                  {link ? <X size={16} /> : <Plus size={16} />}{" "}
                  {link ? "Close" : "Link a sign-in method"}
                </button>
                {link && (
                  <div className="link-form">
                    <SignIn
                      local={local}
                      link
                      onError={setError}
                      onDone={async () => {
                        await refresh();
                        setLink(false);
                        setNotice(
                          "Sign-in method linked. Other sessions signed out.",
                        );
                      }}
                    />
                  </div>
                )}
                <p className="fine">
                  To change a phone number, first link Google, remove the old
                  phone, then verify the new number. Keep at least one method.
                  If you lose one method, sign in using your other linked
                  method.
                </p>
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>Active sessions</h2>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      act(
                        () => api("/account/revoke-sessions", "POST", {}),
                        "Other sessions signed out.",
                      )
                    }
                  >
                    Sign out other devices
                  </button>
                </div>
                {me.account.sessions.map((s) => (
                  <div className="list-row" key={s.id}>
                    <ShieldCheck size={20} />
                    <div className="row-detail">
                      <strong>
                        {s.current ? "This device" : "Other device"}
                      </strong>
                      <small className="device-label">{s.device}</small>
                      <small>
                        Signed in{" "}
                        {new Date(s.createdAt).toLocaleString("en-IN")}
                      </small>
                    </div>
                    {s.current && <span className="pill">Current</span>}
                  </div>
                ))}
              </section>
            </>
          )}
        </main>
        <footer>
          Sangeetha <span>Made for the rhythm of your school.</span>
        </footer>
      </div>
    </div>
  );
}
