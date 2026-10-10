import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  Settings2,
  Wallet,
} from "lucide-react";

/** What a person does in the learning portal, from the scopes they hold. */
export type PortalRoles = { learns: boolean; teaches: boolean; billing: boolean };

export function portalRoles(scopes: { capability: string }[]): PortalRoles {
  const held = new Set(scopes.map((s) => s.capability));
  return {
    learns: held.has("portal.learn"),
    teaches: held.has("classes.teach"),
    billing: held.has("household.billing"),
  };
}

/** The portal's sections, as one navigation layer: the sidebar and the phone tab bar. */
export function portalSections({ learns, teaches, billing }: PortalRoles) {
  return [
    { id: "overview", label: "Home", icon: LayoutDashboard, show: true },
    {
      id: "curriculum",
      label: "Lessons",
      icon: BookOpen,
      show: learns || teaches,
    },
    {
      id: "assignments",
      label: "Assignments",
      icon: ClipboardList,
      show: learns,
    },
    {
      id: "classes",
      label: "Classes",
      icon: CalendarDays,
      show: learns || teaches,
    },
    { id: "family", label: "Fees & events", icon: Wallet, show: billing },
    { id: "feedback", label: "Feedback", icon: MessageSquare, show: learns },
    { id: "settings", label: "Privacy", icon: Settings2, show: learns },
  ].filter((s) => s.show);
}

/** A name for the portal that fits who is reading it. */
export function portalGroupName({ learns, teaches, billing }: PortalRoles) {
  if (billing) return "Family";
  if (teaches && !learns) return "Teaching";
  if (teaches && learns) return "Learning & teaching";
  return "Learning";
}
