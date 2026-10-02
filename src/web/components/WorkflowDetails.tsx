import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { useRouteValue, navigate } from "../routes";
export function WorkflowDetails({
  children,
  context = {},
  ...props
}: HTMLAttributes<HTMLDetailsElement> & { context?: Record<string, string> }) {
  const [action] = useRouteValue("action");
  const ref = useRef<HTMLDetailsElement>(null);
  const summary = Children.toArray(children).find(
    (c) => isValidElement(c) && c.type === "summary",
  );
  const name = isValidElement<{ children?: ReactNode }>(summary)
    ? String(summary.props.children)
    : "";
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  useEffect(() => {
    if (ref.current && id) ref.current.open = action === id;
  }, [action, id]);
  return (
    <details
      {...props}
      ref={ref}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("summary") && id) {
          e.preventDefault();
          navigate({ ...context, action: action === id ? "" : id });
        }
      }}
    >
      {children}
    </details>
  );
}
