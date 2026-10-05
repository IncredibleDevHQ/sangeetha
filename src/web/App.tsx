import { useRouteValue, navigate } from "./routes";
import { SchoolHome } from "./features/school/SchoolHome";
import { availableModules } from "./features/school/navigation";
import { Menu } from "lucide-react";
import { FeatureBoundary } from "./components/FeatureBoundary";

import type { Me } from "./contracts";
import { api, ApiError } from "./lib/api";
import SignIn from "./features/auth/SignIn";
import { lazy, useEffect, useState } from "react";
import {
  Music2,
  LayoutDashboard,
  Users,
  ShieldCheck,
  LogOut,
  ArrowRight,
  Check,
  Settings,
  CalendarDays,
  Wallet,
  BookOpen,
  X,
} from "lucide-react";
const TeamSettings = lazy(() => import("./features/settings/TeamSettings"));
const AccountSettings = lazy(
  () => import("./features/settings/AccountSettings"),
);
const SchoolWorkspace = lazy(() => import("./features/school/Workspace"));
const DirectLesson = lazy(() =>
  import("./components/DirectLesson").then((m) => ({
    default: m.DirectLesson,
  })),
);

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
  const [mobileNav, setMobileNav] = useState(false);
  const [module] = useRouteValue("module");
  const [tenantName, setTenantName] = useState("");
  const [me, setMe] = useState<Me | null>(null),
    [loaded, setLoaded] = useState(false),
    [local, setLocal] = useState(false),
    [authReady, setAuthReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useRouteValue("page", "overview"),
    [schoolId, setSchoolId] = useRouteValue("school"),
    [busy, setBusy] = useState(false);
  const [workspaceAccess, setWorkspaceAccess] = useState<{
    capabilities: string[];
    scopes: { capability: string }[];
  }>({ capabilities: [], scopes: [] });
  const school = schoolId
    ? me?.schools.find((s) => s.id === schoolId)
    : me?.schools[0];
  useEffect(() => {
    setWorkspaceAccess({ capabilities: [], scopes: [] });
    if (school)
      api<typeof workspaceAccess>("/schools/" + school.id + "/views/bootstrap")
        .then(setWorkspaceAccess)
        .catch((e) => setError(e.message));
  }, [school?.id, me?.account]);
  const modules = availableModules(workspaceAccess.capabilities);
  const adminExperience = modules.length > 0;
  const learningExperience = workspaceAccess.scopes.some((s) =>
    ["portal.learn", "classes.teach", "household.billing"].includes(
      s.capability,
    ),
  );
  const reviewerExperience = workspaceAccess.scopes.some(
    (s) => s.capability === "assessments.review",
  );
  useEffect(() => {
    if (school && !schoolId) navigate({ school: school.id }, true);
  }, [school?.id, schoolId]);
  useEffect(() => {
    if (!mobileNav) return;
    document
      .querySelector<HTMLButtonElement>("#school-navigation nav button")
      ?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNav(false);
        document
          .querySelector<HTMLButtonElement>(".navigation-toggle")
          ?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobileNav]);
  async function refresh() {
    try {
      const next = await api<Me>("/me");
      setMe(next);
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
          setAuthReady(true);
          setTenantName(c.school?.name || "");
        },
      ),
      refresh(),
    ])
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);
  async function act(work: () => Promise<unknown>, message = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
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
  if (!authReady)
    return (
      <main className="loading">
        <p>Connection unavailable. Please try again.</p>
        <button
          className="button secondary"
          onClick={() => window.location.reload()}
        >
          Retry connection
        </button>
      </main>
    );
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
                : "Sign in to your school workspace."}
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
    <div className={`app-layout ${mobileNav ? "nav-open" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside id="school-navigation" aria-label="School navigation">
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
        <nav aria-label="Main navigation">
          {[
            { id: "overview", label: "Home", icon: LayoutDashboard },
            ...(learningExperience
              ? [
                  {
                    id: "learning",
                    label: "My learning & teaching",
                    icon: BookOpen,
                  },
                ]
              : []),
            ...(reviewerExperience &&
            !workspaceAccess.capabilities.includes("assessments.manage")
              ? [{ id: "review", label: "Assigned reviews", icon: BookOpen }]
              : []),
          ].map((item) => (
            <button
              key={item.id}
              className={page === item.id ? "active" : ""}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => {
                setMobileNav(false);
                setPage(item.id);
                setError("");
                setNotice("");
              }}
            >
              <item.icon size={19} />
              {item.label}
            </button>
          ))}
          {["School", "Teaching", "Community", "Workspace"].map((group) => {
            const items = modules.filter((m) => m.group === group);
            return (
              items.length > 0 && (
                <div className="nav-group" key={group}>
                  <span className="nav-group-label">{group}</span>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      aria-current={
                        page === "operations" && module === item.id
                          ? "page"
                          : undefined
                      }
                      className={
                        page === "operations" && module === item.id
                          ? "active"
                          : ""
                      }
                      onClick={() => {
                        navigate({ page: "operations", module: item.id });
                        setMobileNav(false);
                        setError("");
                        setNotice("");
                      }}
                    >
                      <item.icon size={18} />
                      {item.name}
                    </button>
                  ))}
                </div>
              )
            );
          })}
          <div className="nav-group">
            <span className="nav-group-label">Personal</span>
            {school?.role === "owner" && (
              <button
                className={page === "team" ? "active" : ""}
                aria-current={page === "team" ? "page" : undefined}
                onClick={() => {
                  setPage("team");
                  setMobileNav(false);
                }}
              >
                <Users size={18} />
                Team & access
              </button>
            )}
            <button
              className={page === "account" ? "active" : ""}
              aria-current={page === "account" ? "page" : undefined}
              onClick={() => {
                setPage("account");
                setMobileNav(false);
              }}
            >
              <Settings size={18} />
              My account
            </button>
          </div>
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">
            {me.account.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            {me.account.displayName}
            <small>
              {school?.role === "owner"
                ? "School owner"
                : adminExperience
                  ? workspaceAccess.capabilities.includes(
                      "curriculum.manage",
                    ) && !workspaceAccess.capabilities.includes("crm.manage")
                    ? "Curriculum Creator"
                    : "School staff"
                  : reviewerExperience
                    ? "Test Reviewer"
                    : "Learning community"}
            </small>
          </div>
          <button aria-label="Sign out" disabled={busy} onClick={signOut}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header>
          <button
            className="navigation-toggle"
            aria-controls="school-navigation"
            aria-expanded={mobileNav}
            onClick={() => setMobileNav(!mobileNav)}
            aria-label={mobileNav ? "Close navigation" : "Open navigation"}
          >
            {mobileNav ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span>
            Workspace /{" "}
            {page === "overview"
              ? "Home"
              : page === "lesson"
                ? "Lesson"
                : page === "operations"
                  ? modules.find((m) => m.id === module)?.name ||
                    "School administration"
                  : page === "learning"
                    ? "Learning portal"
                    : page === "review"
                      ? "Assigned reviews"
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
        <main className="content" id="main-content">
          <FeatureBoundary key={`${school?.id}:${page}`}>
            {alerts}
            {schoolId && !school && (
              <p role="alert">This school is not available to your account.</p>
            )}
            {page === "lesson" && school && (
              <DirectLesson
                school={school}
                manage={workspaceAccess.capabilities.includes(
                  "curriculum.manage",
                )}
              />
            )}
            {page === "operations" && school && adminExperience && (
              <SchoolWorkspace key={school.id} school={school} />
            )}
            {(page === "learning" ||
              (page === "overview" && !adminExperience)) &&
              school &&
              learningExperience && (
                <SchoolWorkspace
                  key={school.id + "learning"}
                  school={school}
                  experience="learning"
                />
              )}
            {(page === "review" ||
              (page === "overview" &&
                !adminExperience &&
                !learningExperience)) &&
              school &&
              (reviewerExperience ||
                workspaceAccess.capabilities.includes(
                  "assessments.manage",
                )) && (
                <SchoolWorkspace
                  key={school.id + "review"}
                  school={school}
                  experience="review"
                />
              )}
            {page === "overview" && school && adminExperience && (
              <SchoolHome
                key={school.id}
                school={school}
                capabilities={workspaceAccess.capabilities}
                name={me.account.displayName}
              />
            )}
            {page === "overview" &&
              !(
                school &&
                (adminExperience || learningExperience || reviewerExperience)
              ) && (
                <>
                  <div className="page-heading">
                    <span className="eyebrow">YOUR MUSIC SCHOOL</span>
                    <h1>
                      Welcome,{" "}
                      {me.account.displayName === "School administrator"
                        ? "teacher"
                        : me.account.displayName.split(" ")[0]}
                      .
                    </h1>
                    <p>
                      {school
                        ? "Your school administration and learning spaces are ready."
                        : "You’re signed in. A school owner needs to invite you before you can enter a workspace."}
                    </p>
                  </div>
                  {school ? (
                    <>
                      <section className="welcome-banner">
                        <div>
                          <span className="tag">YOUR MUSIC SCHOOL</span>
                          <h2>A place for your whole school.</h2>
                          <p>
                            Manage your school and learning through the
                            workspace assigned to you.
                          </p>
                          <button
                            className="button cream"
                            onClick={() =>
                              setPage(
                                adminExperience
                                  ? "operations"
                                  : learningExperience
                                    ? "learning"
                                    : reviewerExperience
                                      ? "review"
                                      : "account",
                              )
                            }
                          >
                            {adminExperience
                              ? "Open school administration"
                              : learningExperience
                                ? "Open learning portal"
                                : reviewerExperience
                                  ? "Open assigned reviews"
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
                            <p>
                              Invite trusted people to help manage your school.
                            </p>
                            <span>
                              Manage access <ArrowRight size={15} />
                            </span>
                          </button>
                        )}
                      </div>
                      <div className="section-heading">
                        <h2>School workflows</h2>
                        <span>Available through assigned access</span>
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
                        Ask the owner to invite your verified email or phone
                        number, then sign in again. Signing in does not create a
                        school or grant access.
                      </p>
                    </section>
                  )}
                </>
              )}
            {page === "team" && school?.role === "owner" && (
              <TeamSettings key={school.id} school={school} />
            )}
            {page === "team" && school?.role !== "owner" && (
              <section className="ui-empty" role="status">
                <ShieldCheck size={28} />
                <h1>Administrator access is managed by the owner</h1>
                <p>
                  Return to your workspace to use the roles assigned to you.
                </p>
                <button
                  className="button secondary"
                  onClick={() => setPage("overview")}
                >
                  Open my workspace
                </button>
              </section>
            )}
            {page === "account" && (
              <AccountSettings
                account={me.account}
                local={local}
                onChanged={refresh}
              />
            )}
          </FeatureBoundary>
        </main>
        <footer>
          Sangeetha <span>Made for the rhythm of your school.</span>
        </footer>
      </div>
    </div>
  );
}
