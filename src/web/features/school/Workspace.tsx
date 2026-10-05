import { availableModules } from "./navigation";
import { useRouteValue, navigate } from "../../routes";
import { useEffect, useState } from "react";
import Households from "./Households";
import { RosterView, ScheduleView, BillingView } from "./Operations";
import { LibraryView, TestsView } from "./Learning";
import { EventsView } from "./Community";
import { PortalView } from "./StudentPortal";
import {
  MessagesView,
  ReportsView,
  AccessView,
  IntegrationsView,
} from "./Administration";
import { useSchool, Alerts, type School } from "./common";
export default function SchoolWorkspace({
  school,
  experience = "admin",
}: {
  school: School;
  experience?: "admin" | "learning" | "review";
}) {
  const tools = useSchool(school),
    [caps, setCaps] = useState<string[]>([]),
    [scopes, setScopes] = useState<string[]>([]),
    [page] = useRouteValue("module"),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    tools
      .read<{ capabilities: string[]; scopes: { capability: string }[] }>(
        "bootstrap",
      )
      .then((b) => {
        setCaps(b.capabilities);
        setScopes(b.scopes.map((s) => s.capability));
      })
      .catch((e) => tools.setError(e.message))
      .finally(() => setLoaded(true));
  }, [tools.read]);
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
    if (loaded && active && !page && experience !== "learning")
      navigate({ module: active }, true);
  }, [loaded, active, page, experience]);
  if (!loaded) return <p>Opening school operations…</p>;
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
          <EventsView tools={tools} finance={caps.includes("finance.manage")} />
        )}{" "}
        {active === "messages" && <MessagesView tools={tools} />}{" "}
        {active === "reports" && <ReportsView tools={tools} />}{" "}
        {active === "access" && <AccessView tools={tools} />}{" "}
        {active === "integrations" && <IntegrationsView tools={tools} />}{" "}
        {active === "portal" && <PortalView tools={tools} />}{" "}
        {!tabs.length && (
          <p>No operational access is assigned. Contact your school owner.</p>
        )}
      </fieldset>
    </>
  );
}
