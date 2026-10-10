import { availableModules } from "./navigation";
import { useRouteValue, navigate } from "../../routes";
import { lazy, useEffect } from "react";
import { FeatureBoundary } from "../../components/FeatureBoundary";
import { PageHeader } from "../../components/PageHeader";
import { useSchool, Alerts, type School } from "./common";

const Households = lazy(() => import("./Households"));
const RosterView = lazy(() =>
  import("./Roster").then((m) => ({ default: m.RosterView })),
);
const ScheduleView = lazy(() =>
  import("./Operations").then((m) => ({ default: m.ScheduleView })),
);
const BillingView = lazy(() =>
  import("./Operations").then((m) => ({ default: m.BillingView })),
);
const LibraryView = lazy(() =>
  import("./Learning").then((m) => ({ default: m.LibraryView })),
);
const TestsView = lazy(() =>
  import("./TestsView").then((m) => ({ default: m.TestsView })),
);
const EventsView = lazy(() =>
  import("./Events").then((m) => ({ default: m.EventsView })),
);
const PortalView = lazy(() =>
  import("./StudentPortal").then((m) => ({ default: m.PortalView })),
);
const MessagesView = lazy(() =>
  import("./Messages").then((m) => ({ default: m.MessagesView })),
);
const ReportsView = lazy(() =>
  import("./Reports").then((m) => ({ default: m.ReportsView })),
);
const AccessView = lazy(() =>
  import("./Access").then((m) => ({ default: m.AccessView })),
);
const IntegrationsView = lazy(() =>
  import("./Administration").then((m) => ({ default: m.IntegrationsView })),
);
export default function SchoolWorkspace({
  school,
  access,
  experience = "admin",
}: {
  school: School;
  access: { capabilities: string[]; scopes: { capability: string }[] };
  experience?: "admin" | "learning" | "review";
}) {
  const tools = useSchool(school),
    caps = access.capabilities,
    scopes = access.scopes.map((scope) => scope.capability),
    [page] = useRouteValue("module");
  const tabs =
    experience === "learning"
      ? scopes.some((s) =>
          ["portal.learn", "classes.teach", "household.billing"].includes(s),
        )
        ? [{ id: "portal", name: "My learning & teaching" }]
        : []
      : experience === "review"
        ? caps.includes("assessments.manage") ||
          scopes.includes("assessments.review")
          ? [{ id: "tests", name: "Tests & reviews" }]
          : []
        : availableModules(caps);
  const active = tabs.some((t) => t.id === page) ? page : tabs[0]?.id;
  useEffect(() => {
    if (active && !page && experience !== "learning")
      navigate({ module: active }, true);
  }, [active, page, experience]);
  const settings =
    experience === "admin"
      ? availableModules(caps).filter((m) => m.group === "Workspace")
      : [];
  const body = (
    <>
      {settings.length > 1 && settings.some((m) => m.id === active) && (
        <nav className="settings-nav" aria-label="Settings">
          {settings.map((m) => (
            <button
              key={m.id}
              aria-current={m.id === active ? "page" : undefined}
              onClick={() => navigate({ module: m.id })}
            >
              <m.icon size={16} aria-hidden="true" />
              {m.name}
            </button>
          ))}
        </nav>
      )}
      <Alerts tools={tools} />
      <FeatureBoundary
        key={active}
        label={`Opening ${tabs.find((t) => t.id === active)?.name || "workspace"}…`}
      >
        <fieldset className="workbench" disabled={tools.busy}>
          {active === "households" && <Households tools={tools} />}{" "}
          {active === "roster" && <RosterView tools={tools} />}{" "}
          {active === "schedule" && <ScheduleView tools={tools} />}{" "}
          {active === "billing" && <BillingView tools={tools} />}{" "}
          {active === "library" && (
            <LibraryView
              tools={tools}
              manage={caps.includes("curriculum.manage")}
            />
          )}{" "}
          {active === "tests" && (
            <TestsView
              tools={tools}
              manage={caps.includes("assessments.manage")}
              canPublish={caps.includes("reviews.publish")}
              canExport={caps.includes("dataset.export")}
            />
          )}{" "}
          {active === "events" && (
            <EventsView
              tools={tools}
              finance={caps.includes("finance.manage")}
            />
          )}{" "}
          {active === "messages" && <MessagesView tools={tools} />}{" "}
          {active === "reports" && (
            <ReportsView tools={tools} capabilities={caps} />
          )}{" "}
          {active === "access" && <AccessView tools={tools} />}{" "}
          {active === "integrations" && <IntegrationsView tools={tools} />}{" "}
          {active === "portal" && <PortalView tools={tools} />}{" "}
          {!tabs.length && (
            <p>No operational access is assigned. Contact your school owner.</p>
          )}
        </fieldset>
      </FeatureBoundary>
    </>
  );
  if (experience === "learning") return body;
  return (
    <PageHeader
      title={tabs.find((t) => t.id === active)?.name || "School workspace"}
      description={
        availableModules(caps).find((m) => m.id === active)?.summary ||
        "Listen to assigned recordings and prepare feedback."
      }
    >
      {body}
    </PageHeader>
  );
}
