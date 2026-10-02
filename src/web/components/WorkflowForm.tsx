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
    if (form === routeKey() && ref.current?.getClientRects().length)
      ref.current.scrollIntoView({ block: "start" });
  }, [form, key]);
  return (
    <form
      {...props}
      ref={ref}
      onFocus={(e) => {
        onFocus?.(e);
        if (form !== routeKey()) navigate({ form: routeKey() });
      }}
    >
      {children}
    </form>
  );
}
