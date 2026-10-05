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
  Check,
  Settings,
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

type WorkspaceAccess = {
  capabilities: string[];
  scopes: { capability: string }[];
};

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
  const [accessAttempt, setAccessAttempt] = useState(0);
  const [accessResult, setAccessResult] = useState<
    WorkspaceAccess & {
      schoolId: string;
      status: "loading" | "ready" | "error";
      error: string;
    }
  >({
    schoolId: "",
    status: "loading",
    capabilities: [],
    scopes: [],
    error: "",
  });
  const school = schoolId
    ? me?.schools.find((s) => s.id === schoolId)
    : me?.schools[0];
  const accessReady = Boolean(
    school &&
      accessResult.schoolId === school.id &&
      accessResult.status === "ready",
  );
  const accessFailed = Boolean(
    school &&
      accessResult.schoolId === school.id &&
      accessResult.status === "error",
  );
  const workspaceAccess: WorkspaceAccess = accessReady
    ? accessResult
    : { capabilities: [], scopes: [] };
  const needsWorkspaceAccess = Boolean(
    school &&
      ["overview", "operations", "learning", "review", "lesson"].includes(page),
  );
  useEffect(() => {
    if (!school) return;
    let active = true;
    const id = school.id;
    setAccessResult({
      schoolId: id,
      status: "loading",
      capabilities: [],
      scopes: [],
      error: "",
    });
    api<WorkspaceAccess>("/schools/" + id + "/views/bootstrap")
      .then((result) => {
        if (active)
          setAccessResult({
            ...result,
            schoolId: id,
            status: "ready",
            error: "",
          });
      })
      .catch((e: Error) => {
        if (active && e instanceof ApiError && e.status === 401) {
          setMe(null);
          return;
        }
        if (active)
          setAccessResult({
            schoolId: id,
            status: "error",
            capabilities: [],
            scopes: [],
            error: e.message,
          });
      });
    return () => {
      active = false;
    };
  }, [school?.id, me?.account, accessAttempt]);
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
              A calmer rhythm <br />
              for your school.
            </h1>
            <p>
              One home for your music school. <br />A little more time for what
              you love teaching.
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
            {needsWorkspaceAccess && !accessReady ? (
              <section
                className="workspace-access-state"
                role={accessFailed ? "alert" : "status"}
              >
                <span className="workspace-access-icon">
                  <ShieldCheck size={24} />
                </span>
                <h1>
                  {accessFailed
                    ? "We couldn’t open your workspace"
                    : "Opening your school workspace…"}
                </h1>
                <p>
                  {accessFailed
                    ? accessResult.error
                    : "Checking your assigned roles and learning spaces."}
                </p>
                {accessFailed && (
                  <button
                    className="button primary"
                    onClick={() => setAccessAttempt((n) => n + 1)}
                  >
                    Retry workspace
                  </button>
                )}
              </section>
            ) : (
              <>
                {school &&
                  accessReady &&
                  ((page === "operations" && !adminExperience) ||
                    (page === "learning" && !learningExperience) ||
                    (page === "review" &&
                      !reviewerExperience &&
                      !workspaceAccess.capabilities.includes(
                        "assessments.manage",
                      ))) && (
                    <section className="workspace-access-state" role="status">
                      <span className="workspace-access-icon">
                        <ShieldCheck size={24} />
                      </span>
                      <h1>This workspace isn’t assigned to you</h1>
                      <p>
                        Open your home to see the learning, teaching or office
                        spaces available to your account.
                      </p>
                      <button
                        className="button primary"
                        onClick={() => setPage("overview")}
                      >
                        Open my workspace
                      </button>
                    </section>
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
                    (adminExperience ||
                      learningExperience ||
                      reviewerExperience)
                  ) && (
                    <section className="workspace-access-state" role="status">
                      <span className="workspace-access-icon">
                        <ShieldCheck size={24} />
                      </span>
                      <span className="eyebrow">
                        {school ? school.name : "WELCOME TO SANGEETHA"}
                      </span>
                      <h1>
                        {school
                          ? "Your workspace is awaiting access"
                          : "You’re signed in. Let’s connect your school."}
                      </h1>
                      <p>
                        {school
                          ? "You’re a member of this school, but no teaching, learning or office workspace is assigned yet. Ask the school owner to assign the role you need."
                          : "Ask the school owner to invite the verified Google email or phone number you use to sign in. Your account is ready; school access starts with an invitation."}
                      </p>
                      <div className="workspace-access-actions">
                        <button
                          className="button primary"
                          onClick={() => window.location.reload()}
                        >
                          Check access again
                        </button>
                        <button
                          className="button secondary"
                          onClick={() => setPage("account")}
                        >
                          Manage my account
                        </button>
                      </div>
                    </section>
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
              </>
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
