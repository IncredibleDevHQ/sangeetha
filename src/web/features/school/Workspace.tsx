import { availableModules } from "./navigation";
import { useRouteValue, navigate } from "../../routes";
import { lazy, useEffect } from "react";
import { FeatureBoundary } from "../../components/FeatureBoundary";
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
  return (
    <>
      {experience !== "learning" && (
        <div className="workspace-context">
          <h1>
            {tabs.find((t) => t.id === active)?.name || "School workspace"}
          </h1>
          <p>
            {availableModules(caps).find((m) => m.id === active)?.description ||
              "Listen to assigned recordings and prepare feedback."}
          </p>
        </div>
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
}
