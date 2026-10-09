import { useEffect, useRef, useState } from "react";
import { ChevronUp, LogOut, Settings } from "lucide-react";
import { Initials } from "./ui";

/** Who is signed in, with their account and sign-out one deliberate step away. */
export function AccountMenu({
  name,
  detail,
  busy,
  current,
  onAccount,
  onSignOut,
}: {
  name: string;
  detail: string;
  busy: boolean;
  current: boolean;
  onAccount: () => void;
  onSignOut: () => void;
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
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="account-menu" ref={root}>
      {open && (
        <div className="account-menu-list" role="menu" aria-label="Account">
          <button
            type="button"
            role="menuitem"
            aria-current={current ? "page" : undefined}
            onClick={() => {
              setOpen(false);
              onAccount();
            }}
          >
            <Settings size={17} aria-hidden="true" />
            My account
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
      <button
        ref={toggle}
        type="button"
        className="account-button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Initials name={name} />
        <span>
          <strong>{name}</strong>
          <small>{detail}</small>
        </span>
        <ChevronUp size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
