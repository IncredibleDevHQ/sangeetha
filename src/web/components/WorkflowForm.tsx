import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";
import { navigate, useRouteValue } from "../routes";
function label(nodes: ReactNode): string {
  for (const child of Children.toArray(nodes))
    if (isValidElement<{ children?: ReactNode; type?: string }>(child)) {
      if (child.type === "button" && child.props.type !== "button")
        return Children.toArray(child.props.children)
          .filter((c) => typeof c === "string")
          .join(" ");
      const nested = label(child.props.children);
      if (nested) return nested;
    }
  return "";
}
export function WorkflowForm({
  children,
  onFocus,
  ...props
}: FormHTMLAttributes<HTMLFormElement>) {
  const [form] = useRouteValue("form");
  const ref = useRef<HTMLFormElement>(null);
  const key = (label(children) || "form")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  const routeKey = () => {
    const resource = ref.current
      ?.closest("[data-route-resource]")
      ?.getAttribute("data-route-resource");
    return resource ? key + "-" + resource : key;
  };
  useEffect(() => {
    if (form === routeKey() && ref.current) {
      let parent = ref.current.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      ref.current.scrollIntoView({ block: "nearest" });
    }
  }, [form, key]);
  return (
    <form
      {...props}
      ref={ref}
      data-workflow-form={key}
      onFocus={(e) => {
        onFocus?.(e);
        // Focusing an action must not scroll its form between pointer down and
        // click. Record form intent when the user enters an editable control.
        if (
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLSelectElement) &&
          !(e.target instanceof HTMLTextAreaElement) &&
          !(e.target instanceof HTMLElement && e.target.isContentEditable)
        )
          return;
        if (form !== routeKey()) navigate({ form: routeKey() });
      }}
    >
      {children}
    </form>
  );
}
