import type { ButtonHTMLAttributes, ReactNode } from "react";
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
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="ui-empty">{children}</div>;
}
export const dateLabel = (value: string, withTime = false) => {
  if (!value) return "";
  const date = new Date(value.length === 10 ? value + "T12:00:00" : value);
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    ...(withTime
      ? { hour: "numeric", minute: "2-digit", timeZoneName: "short" as const }
      : {}),
  }).format(date);
};
