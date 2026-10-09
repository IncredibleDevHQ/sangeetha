import { useRouteValue, navigate } from "./routes";
import { SchoolHome } from "./features/school/SchoolHome";
import { availableModules } from "./features/school/navigation";
import { Menu } from "lucide-react";
import { FeatureBoundary } from "./components/FeatureBoundary";
import { Brand } from "./components/Brand";
import { AccountMenu } from "./components/AccountMenu";
import { personalName } from "../core/account";
import {
  portalGroupName,
  portalRoles,
  portalSections,
} from "./features/school/portalSections";

import type { Me } from "./contracts";
import { api, ApiError } from "./lib/api";
import SignIn from "./features/auth/SignIn";
import { lazy, useEffect, useState } from "react";
import {
  LayoutDashboard,
  ShieldCheck,
  Check,
  BookOpen,
  SlidersHorizontal,
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

export default function App() {
  const [mobileNav, setMobileNav] = useState(false);
  const [module] = useRouteValue("module");
  const [section] = useRouteValue("section");
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
    if (!accessReady) return;
    const onlyArea =
      modules.length === 1 && !learningExperience && !reviewerExperience;
    if (page === "overview" && onlyArea)
      navigate({ page: "operations", module: modules[0].id }, true);
    if (page === "team" && school?.role === "owner")
      navigate(
        { page: "operations", module: "access", status: "admins" },
        true,
      );
  }, [accessReady, page, modules.length, learningExperience, school?.role]);
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
  if (!loaded) return <main className="loading">Opening Tulsi…</main>;
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
      <main className="tulsi-login">
        <section className="tulsi-login-story">
          <Brand />
          <div>
            <h1>Where music grows, a little every day.</h1>
            <p>
              In many homes the day begins at the tulsi — a little water, a
              lamp, a moment of care. Riyaz grows the same way. Tulsi gives your
              school one calm courtyard for it: classes, families, fees and the
              music itself.
            </p>
          </div>
          <ul className="tulsi-features" aria-label="What Tulsi brings">
            {[
              ["icon-calendar", "Live attendance"],
              ["icon-practice", "Swara-synced practice"],
              ["icon-fees", "UPI fees"],
              ["icon-feedback", "WhatsApp reminders"],
            ].map(([icon, label]) => (
              <li className="tulsi-feature" key={icon}>
                <img
                  className="tulsi-art"
                  src={`/art/${icon}.svg`}
                  width={36}
                  height={36}
                  alt=""
                />
                {label}
              </li>
            ))}
          </ul>
          <img
            className="tulsi-art tulsi-login-art"
            src="/art/courtyard-dawn.svg"
            width={520}
            height={520}
            alt=""
          />
        </section>
        <section className="tulsi-login-panel">
          <div className="login-card">
            <span className="eyebrow">Welcome to Tulsi</span>
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
  const settings = modules.filter((m) => m.group === "Workspace");
  const inSettings =
    page === "operations" && settings.some((m) => m.id === module);
  // A copied review link opens the review page. Staff who manage tests have no
  // "Assigned reviews" item, so it belongs to their Tests & reviews module.
  const reviewModule =
    page === "review" &&
    workspaceAccess.capabilities.includes("assessments.manage")
      ? modules.find((m) => m.id === "tests")
      : undefined;
  const roles = portalRoles(workspaceAccess.scopes);
  const sections = learningExperience ? portalSections(roles) : [];
  // Learning-only people use Home for the portal; staff who are also family get it as a group.
  const portalPage = adminExperience ? "learning" : "overview";
  const showPortal = (id: string) => {
    setMobileNav(false);
    setError("");
    setNotice("");
    navigate({
      page: portalPage,
      section: id === "overview" ? "" : id,
      test: "",
      review: "",
      lesson: "",
      asset: "",
      action: "",
      form: "",
      occurrence: "",
      learner: "",
    });
  };
  const sectionActive = (id: string) =>
    page === portalPage && (section || "overview") === id;
  const singleArea =
    adminExperience &&
    modules.length === 1 &&
    !learningExperience &&
    !reviewerExperience;
  const name =
    personalName(me.account.displayName) ||
    me.account.identities[0]?.label ||
    "Your account";
  const roleLabel =
    school?.role === "owner"
      ? "Owner"
      : school?.role === "admin"
        ? "Administrator"
        : adminExperience
          ? "Staff"
          : roles.billing
            ? "Family"
            : roles.teaches
              ? "Teacher"
              : reviewerExperience
                ? "Reviewer"
                : roles.learns
                  ? "Learner"
                  : "Member";
  const pageName =
    page === "overview"
      ? learningExperience && !adminExperience
        ? sections.find((s) => s.id === (section || "overview"))?.label ||
          "Home"
        : "Home"
      : page === "lesson"
        ? "Lesson"
        : page === "operations"
          ? (inSettings ? "Settings / " : "") +
            (modules.find((m) => m.id === module)?.name || "School")
          : page === "learning"
            ? portalGroupName(roles)
            : page === "review"
              ? reviewModule?.name || "Assigned reviews"
              : "My account";
  return (
    <div
      className={`app-layout ${mobileNav ? "nav-open" : ""} ${
        learningExperience && !adminExperience ? "has-tabbar" : ""
      }`}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside id="school-navigation" aria-label="School navigation">
        <div className="sidebar-top">
          <Brand />
          {me.schools.length > 1 ? (
            <select
              className="school-switch"
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
            <p className="school-switch">
              {school?.name || "No school access yet"}
            </p>
          )}
        </div>
        <nav aria-label="Main navigation" className="sidebar-nav">
          {!singleArea && (adminExperience || !learningExperience) && (
            <button
              className={page === "overview" ? "active" : ""}
              aria-current={page === "overview" ? "page" : undefined}
              onClick={() => {
                setMobileNav(false);
                setPage("overview");
                setError("");
                setNotice("");
              }}
            >
              <LayoutDashboard size={18} aria-hidden="true" />
              Home
            </button>
          )}
          {sections.length > 0 && (
            <div className="nav-group">
              {adminExperience && (
                <span className="nav-group-label">
                  {"My " + portalGroupName(roles).toLowerCase()}
                </span>
              )}
              {sections
                .filter((s) => adminExperience || s.id !== "settings")
                .map((s) => (
                  <button
                    key={s.id}
                    className={sectionActive(s.id) ? "active" : ""}
                    aria-current={sectionActive(s.id) ? "page" : undefined}
                    onClick={() => showPortal(s.id)}
                  >
                    <s.icon size={18} aria-hidden="true" />
                    {adminExperience && s.id === "overview"
                      ? "Overview"
                      : s.label}
                  </button>
                ))}
            </div>
          )}
          {reviewerExperience &&
            !workspaceAccess.capabilities.includes("assessments.manage") && (
              <button
                className={page === "review" ? "active" : ""}
                aria-current={page === "review" ? "page" : undefined}
                onClick={() => {
                  setMobileNav(false);
                  setPage("review");
                }}
              >
                <BookOpen size={18} aria-hidden="true" />
                Assigned reviews
              </button>
            )}
          {["School", "Teaching", "Community"].map((group) => {
            const items = modules.filter((m) => m.group === group);
            return (
              items.length > 0 && (
                <div className="nav-group" key={group}>
                  {!singleArea && (
                    <span className="nav-group-label">{group}</span>
                  )}
                  {items.map((item) => (
                    <button
                      key={item.id}
                      title={item.description}
                      aria-current={
                        (page === "operations" && module === item.id) ||
                        reviewModule === item
                          ? "page"
                          : undefined
                      }
                      className={
                        (page === "operations" && module === item.id) ||
                        reviewModule === item
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
                      <item.icon size={18} aria-hidden="true" />
                      {item.name}
                    </button>
                  ))}
                </div>
              )
            );
          })}
          {settings.length > 0 && (
            <div className="nav-group">
              <button
                className={inSettings ? "active" : ""}
                aria-current={inSettings ? "page" : undefined}
                onClick={() => {
                  navigate({ page: "operations", module: settings[0].id });
                  setMobileNav(false);
                  setError("");
                  setNotice("");
                }}
              >
                <SlidersHorizontal size={18} aria-hidden="true" />
                Settings
              </button>
            </div>
          )}
          {learningExperience && !adminExperience && (
            <div className="nav-group">
              {sections
                .filter((s) => s.id === "settings")
                .map((s) => (
                  <button
                    key={s.id}
                    className={sectionActive(s.id) ? "active" : ""}
                    aria-current={sectionActive(s.id) ? "page" : undefined}
                    onClick={() => showPortal(s.id)}
                  >
                    <s.icon size={18} aria-hidden="true" />
                    Learning privacy
                  </button>
                ))}
            </div>
          )}
        </nav>
        <AccountMenu
          name={name}
          detail={roleLabel}
          busy={busy}
          current={page === "account"}
          onAccount={() => {
            setMobileNav(false);
            setPage("account");
          }}
          onSignOut={signOut}
        />
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
          <span className="crumb">
            <span className="crumb-root">{school?.name || "Tulsi"} / </span>
            {pageName}
          </span>
          <div className="header-actions">
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
                  <SchoolWorkspace
                    key={school.id}
                    school={school}
                    access={workspaceAccess}
                  />
                )}
                {(page === "learning" ||
                  (page === "overview" && !adminExperience)) &&
                  school &&
                  learningExperience && (
                    <SchoolWorkspace
                      key={school.id + "learning"}
                      school={school}
                      access={workspaceAccess}
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
                      access={workspaceAccess}
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
                        {school ? school.name : "WELCOME TO TULSI"}
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
          Tulsi <span>Where music grows, a little every day.</span>
        </footer>
      </div>
      {learningExperience && !adminExperience && (
        <nav className="portal-tabbar" aria-label="Sections">
          {sections.slice(0, 5).map((s) => (
            <button
              key={s.id}
              aria-current={sectionActive(s.id) ? "page" : undefined}
              onClick={() => showPortal(s.id)}
            >
              <s.icon size={20} aria-hidden="true" />
              <span>{s.id === "family" ? "Fees" : s.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
