import { useEffect, useState } from "react";
import Households from "./Households";
import { RosterView, ScheduleView, BillingView } from "./Operations";
import { LibraryView, TestsView } from "./Learning";
import { EventsView, PortalView } from "./Community";
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
    [page, setPage] = useState(""),
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
  const tabs = [
    { id: "households", name: "Households", show: caps.includes("crm.manage") },
    { id: "roster", name: "Batches", show: caps.includes("crm.manage") },
    { id: "schedule", name: "Classes", show: caps.includes("schedule.manage") },
    { id: "billing", name: "Fees", show: caps.includes("finance.manage") },
    {
      id: "library",
      name: "Curriculum",
      show: caps.includes("curriculum.manage"),
    },
    {
      id: "tests",
      name: "Tests & reviews",
      show:
        caps.includes("assessments.manage") ||
        scopes.includes("assessments.review"),
    },
    { id: "events", name: "Events", show: caps.includes("events.manage") },
    {
      id: "messages",
      name: "Messages",
      show: caps.includes("communicate.manage"),
    },
    { id: "reports", name: "Reports", show: caps.includes("reports.read") },
    { id: "access", name: "Access", show: caps.includes("team.manage") },
    {
      id: "integrations",
      name: "Integrations",
      show: caps.includes("team.manage"),
    },
    {
      id: "portal",
      name: "My learning & teaching",
      show: scopes.some((s) =>
        ["portal.learn", "classes.teach", "household.billing"].includes(s),
      ),
    },
  ].filter(
    (t) =>
      t.show &&
      (experience === "learning"
        ? t.id === "portal"
        : experience === "review"
          ? t.id === "tests"
          : t.id !== "portal"),
  );
  const active = tabs.some((t) => t.id === page) ? page : tabs[0]?.id;
  if (!loaded) return <p>Opening school operations…</p>;
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">
          {experience === "admin"
            ? "SCHOOL ADMINISTRATION"
            : experience === "review"
              ? "ASSIGNED REVIEW WORK"
              : "LEARNING PORTAL"}
        </span>
        <h1>
          {experience === "admin"
            ? "Your school, together."
            : experience === "review"
              ? "Your review queue."
              : "Your music journey."}
        </h1>
        <p>
          Households, learning and money, with access scoped to your school.
        </p>
      </div>
      <div className="module-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={active === t.id ? "selected" : ""}
            onClick={() => setPage(t.id)}
          >
            {t.name}
          </button>
        ))}
      </div>
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
