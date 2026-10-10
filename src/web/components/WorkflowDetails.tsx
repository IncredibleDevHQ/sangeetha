import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { useRouteValue, navigate } from "../routes";

/** The route id for a workflow, from its title: "Create test" → "create-test". */
export const workflowId = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Opens the workflow panel or disclosure with this title. */
export function openWorkflow(title: string, context: Record<string, string> = {}) {
  navigate({ ...context, action: workflowId(title), form: "" });
}

/** True when a routed form (a deep link to a form) lives inside this element. */
function holdsRoutedForm(root: HTMLElement | null, form: string) {
  if (!root || !form) return false;
  return Array.from(
    root.querySelectorAll<HTMLFormElement>("form[data-workflow-form]"),
  ).some((element) => {
    const resource = element
      .closest("[data-route-resource]")
      ?.getAttribute("data-route-resource");
    const key = element.dataset.workflowForm;
    return form === (resource ? key + "-" + resource : key);
  });
}

/**
 * A focused panel for a primary workflow (create, schedule, edit). It opens from
 * a button elsewhere on the page, through the route, and closes back to the page.
 */
export function WorkflowPanel({
  title,
  description,
  context = {},
  className = "",
  children,
}: {
  title: string;
  description?: ReactNode;
  context?: Record<string, string>;
  className?: string;
  children: ReactNode;
}) {
  const [action] = useRouteValue("action");
  const [form] = useRouteValue("form");
  const id = workflowId(title);
  const ref = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(action === id || (!action && holdsRoutedForm(ref.current, form)));
  }, [action, form, id]);
  useEffect(() => {
    if (!open) return;
    heading.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ block: "nearest" });
  }, [open]);
  return (
    <section
      ref={ref}
      className={`workflow-panel ${className}`.trim()}
      hidden={!open}
      aria-labelledby={id + "-title"}
    >
      <header>
        <div>
          <h2 id={id + "-title"} ref={heading} tabIndex={-1}>
            {title}
          </h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="workflow-panel-close"
          aria-label={"Close " + title.toLowerCase()}
          onClick={() => navigate({ ...context, action: "", form: "" })}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>
      {children}
    </section>
  );
}
export function WorkflowDetails({
  children,
  context = {},
  ...props
}: HTMLAttributes<HTMLDetailsElement> & { context?: Record<string, string> }) {
  const [action] = useRouteValue("action");
  const [form] = useRouteValue("form");
  const ref = useRef<HTMLDetailsElement>(null);
  const summary = Children.toArray(children).find(
    (c) => isValidElement(c) && c.type === "summary",
  );
  const name = isValidElement<{ children?: ReactNode }>(summary)
    ? String(summary.props.children)
    : "";
  const id = workflowId(name);
  useEffect(() => {
    if (ref.current && id)
      ref.current.open =
        action === id || (!action && holdsRoutedForm(ref.current, form));
  }, [action, id, form]);
  return (
    <details
      {...props}
      ref={ref}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("summary") && id) {
          e.preventDefault();
          navigate({
            ...context,
            action: ref.current?.open ? "" : id,
            form: "",
          });
        }
      }}
    >
      {children}
    </details>
  );
}
