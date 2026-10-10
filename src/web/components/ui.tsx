import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { Art, type ArtName } from "./Art";
import { formatWhen, type Clock } from "../lib/when";
export function Action({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <button
      type="button"
      {...props}
      className={`ui-action ui-action-${variant} ${className}`}
    />
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "attention";
}) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}
export function SectionTitle({
  title,
  detail,
  action,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="ui-section-title">
      <div>
        <h2>{title}</h2>
        {detail && <p>{detail}</p>}
      </div>
      {action}
    </div>
  );
}
export function EmptyState({
  children,
  art,
}: {
  children: ReactNode;
  art?: ArtName;
}) {
  if (!art) return <div className="ui-empty">{children}</div>;
  return (
    <div className="ui-empty art-state">
      <Art name={art} size={72} />
      <div>{children}</div>
    </div>
  );
}
/** A date, or a day and time, in Tulsi's one format (see lib/when). */
export const dateLabel = (value: string, withTime = false, clock?: Clock) =>
  formatWhen(value, withTime ? "dayTime" : "date", clock);

/** Every detail page returns the same way, from the same spot above its title. */
export function BackLink({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className="back-link" onClick={onClick}>
      <ChevronLeft size={16} aria-hidden="true" />
      {children}
    </button>
  );
}

type Tone = "neutral" | "success" | "attention";
/** API status values, as people read them. */
const STATUSES: Record<string, [string, Tone]> = {
  scheduled: ["Scheduled", "neutral"],
  completed: ["Completed", "success"],
  cancelled: ["Cancelled", "attention"],
  active: ["Active", "success"],
  paused: ["Paused", "neutral"],
  ended: ["Ended", "neutral"],
  withdrawn: ["Withdrawn", "neutral"],
  archived: ["Archived", "neutral"],
  verified: ["Verified", "success"],
  claim: ["Awaiting verification", "attention"],
  pending: ["Pending", "attention"],
  rejected: ["Not verified", "attention"],
  owner: ["Owner", "neutral"],
  admin: ["Administrator", "neutral"],
  member: ["Member", "neutral"],
  present: ["Present", "success"],
  late: ["Late", "attention"],
  absent: ["Absent", "attention"],
  excused: ["Excused", "neutral"],
};
const sentence = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1).replace(/[_-]+/g, " ");
/** How a family or the office paid, as people say it. */
export const paymentMethod = (method: string) =>
  ({ upi: "UPI", bank: "Bank transfer", cash: "Cash", card: "Card" })[method] ||
  sentence(method);
export const statusLabel = (status: string) =>
  STATUSES[status]?.[0] || sentence(status);

/**
 * A status in sentence case with a consistent tone. Pass the everyday value as
 * `usual` to show nothing for it, so lists only call out exceptions.
 */
export function StatusPill({
  status,
  usual,
}: {
  status: string;
  usual?: string;
}) {
  if (!status || status === usual) return null;
  return (
    <Badge tone={STATUSES[status]?.[1] || "neutral"}>
      {statusLabel(status)}
    </Badge>
  );
}

/** Initials stand in for a person or family in lists, instead of a repeated icon. */
export function Initials({ name }: { name: string }) {
  const words = name
    .split(/[\s·]+/)
    .filter((w) => w && !/^(family|household|the|&)$/i.test(w));
  const letters =
    (words[0]?.[0] || "") + (words.length > 1 ? words[words.length - 1][0] : "");
  return (
    <span className="initials" aria-hidden="true">
      {letters.toUpperCase() || "·"}
    </span>
  );
}

/** Staff share a page by link; the link itself stays out of the way. */
export function CopyLink({
  href,
  label = "Copy link",
}: {
  href: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-button copy-link"
      onClick={() =>
        navigator.clipboard
          ?.writeText(href)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => setCopied(false))
      }
    >
      <span aria-live="polite">{copied ? "Link copied" : label}</span>
    </button>
  );
}
