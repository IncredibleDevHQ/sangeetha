import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

const ActionsSlot = createContext<HTMLElement | null>(null);

/**
 * One header per page: a title, one line about the page, and its actions on the
 * right. Modules place their primary actions here with <PageActions>.
 */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // A detail view may already have focused its own heading inside the page.
    const main = heading.current?.closest("main");
    if (!main?.contains(document.activeElement))
      heading.current?.focus({ preventScroll: true });
  }, [title]);
  return (
    <>
      <header className="page-header">
        <div>
          <h1 ref={heading} tabIndex={-1}>
            {title}
          </h1>
          {description && <p>{description}</p>}
        </div>
        <div className="page-actions" ref={setSlot} />
      </header>
      <ActionsSlot.Provider value={slot}>{children}</ActionsSlot.Provider>
    </>
  );
}

/** Renders its children in the page header's action area. */
export function PageActions({ children }: { children: ReactNode }) {
  const slot = useContext(ActionsSlot);
  return slot ? createPortal(children, slot) : null;
}

/** Moves focus back to the page title, for list views that have no heading of their own. */
export function focusPageHeading() {
  document
    .querySelector<HTMLElement>(".page-header h1")
    ?.focus({ preventScroll: true });
}

/** Setup and occasional tools, kept out of the way of daily work. */
export function MoreMenu({
  label = "More",
  items,
}: {
  label?: string;
  items: { label: string; onSelect: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const away = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const options = Array.from(
          root.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ||
            [],
        );
        const at = options.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          (at + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
          options.length;
        options[next]?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", keys);
    };
  }, [open]);
  return (
    <div className="more-menu" ref={root}>
      <button
        ref={toggle}
        type="button"
        className="button secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <MoreHorizontal size={18} aria-hidden="true" />
        {label}
      </button>
      {open && (
        <div className="more-menu-list" role="menu">
          {items.map((item) => (
            <button
              type="button"
              role="menuitem"
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
