import { useEffect, useRef, useState } from "react";
import {
  Check,
  Mail,
  Monitor,
  Phone,
  Plus,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { Me } from "../../contracts";
import { api } from "../../lib/api";
import { navigate, useRouteValue } from "../../routes";
import { Badge, BackLink } from "../../components/ui";
import { formatWhen } from "../../lib/when";
import { WorkflowForm } from "../../components/WorkflowForm";
import SignIn from "../auth/SignIn";
import "./Settings.css";

export default function AccountSettings({
  account,
  local,
  onChanged,
}: {
  account: Me["account"];
  local: boolean;
  onChanged: () => Promise<void>;
}) {
  const [section] = useRouteValue("accountSection", "profile"),
    [action] = useRouteValue("action"),
    [method] = useRouteValue("method");
  const [name, setName] = useState(account.displayName),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const heading = useRef<HTMLHeadingElement>(null),
    actionHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => setName(account.displayName), [account.displayName]);
  useEffect(() => {
    (actionHeading.current || heading.current)?.focus();
  }, [section, action]);
  const go = (values: Record<string, string>) => {
    setError("");
    setMessage("");
    navigate(values);
  };
  async function act(work: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    let saved = false;
    try {
      await work();
      saved = true;
      await onChanged();
      navigate({ action: "", form: "", method: "" });
      setMessage(success);
    } catch (e) {
      setError(
        saved
          ? "Your change was saved, but account details could not refresh. Reload the page to see the current state."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const identity = account.identities.find((i) => i.provider === method),
    linking = action === "link-sign-in-method",
    otherSessions = account.sessions.filter((s) => !s.current).length;
  return (
    <section className="settings-workspace">
      <div className="page-heading">
        <span className="eyebrow">Your personal workspace</span>
        <h1>My account</h1>
        <p>Your profile, verified sign-in methods and devices.</p>
      </div>
      <div
        className="settings-tabs settings-account-tabs"
        aria-label="Account sections"
      >
        {[
          ["profile", "Profile", UserRound],
          ["sign-in", "Sign-in methods", ShieldCheck],
          ["sessions", "Devices", Monitor],
        ].map(([id, label, Icon]) => {
          const Glyph = Icon as typeof UserRound;
          return (
            <button
              key={String(id)}
              disabled={busy}
              aria-pressed={section === id}
              onClick={() =>
                go({
                  accountSection: String(id),
                  action: "",
                  form: "",
                  method: "",
                })
              }
            >
              <Glyph size={16} />
              {String(label)}
            </button>
          );
        })}
      </div>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {message && (
        <div className="success" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      <fieldset className="settings-body" disabled={busy}>
        {section === "profile" ? (
          <div className="settings-columns">
            <WorkflowForm
              className="settings-card settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                void act(
                  () => api("/account", "PATCH", { name: name.trim() }),
                  "Your display name was updated.",
                );
              }}
            >
              <span className="settings-icon">
                <UserRound size={23} />
              </span>
              <h2 ref={heading} tabIndex={-1}>
                How should we address you?
              </h2>
              <p className="settings-description">
                This is the name shown on your account across your schools.
              </p>
              <label>
                Display name
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="settings-actions">
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    name.trim() === account.displayName ||
                    name.trim().length < 2
                  }
                >
                  {busy ? "Saving…" : "Save name"}
                </button>
                {name !== account.displayName && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setName(account.displayName)}
                  >
                    Reset changes
                  </button>
                )}
              </div>
            </WorkflowForm>
            <aside className="settings-help">
              <ShieldCheck size={23} />
              <h3>Profile and school records</h3>
              <p>
                Your display name does not change a learner’s name, household
                contact or school permissions. The school manages those
                separately.
              </p>
            </aside>
          </div>
        ) : section === "sign-in" ? (
          <>
            {linking ? (
              <>
                <BackLink onClick={() => go({ action: "", form: "" })}>All sign-in methods</BackLink>
                <div className="settings-card settings-link-method">
                  <h2 ref={heading} tabIndex={-1}>
                    Link a sign-in method
                  </h2>
                  <p>
                    Verify an identity you own to use it with this account. Sign
                    in again first if your last verification was more than five
                    minutes ago.
                  </p>
                  <SignIn
                    local={local}
                    link
                    onError={setError}
                    onDone={async () => {
                      await onChanged();
                      navigate({ action: "", form: "" });
                      setError("");
                      setMessage(
                        "Sign-in method linked. Your other sessions were signed out.",
                      );
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="settings-toolbar">
                  <div>
                    <h2 ref={heading} tabIndex={-1}>
                      Ways to sign in
                    </h2>
                    <p>Use either linked method to access this account.</p>
                  </div>
                  <button
                    className="button primary"
                    onClick={() =>
                      go({
                        action: "link-sign-in-method",
                        form: "",
                        method: "",
                      })
                    }
                  >
                    <Plus size={16} /> Link a sign-in method
                  </button>
                </div>
                <div className="settings-identity-list">
                  {account.identities.map((i) => (
                    <article className="settings-identity" key={i.provider}>
                      <span className="settings-avatar">
                        {i.provider === "phone" ? (
                          <Phone size={22} />
                        ) : (
                          <Mail size={22} />
                        )}
                      </span>
                      <div className="settings-person">
                        <strong>
                          {i.provider === "phone" ? "Phone OTP" : "Google"}
                        </strong>
                        <small>{i.label}</small>
                      </div>
                      <Badge tone="success">Verified</Badge>
                      {account.identities.length > 1 ? (
                        <button
                          className="text-button danger"
                          onClick={() =>
                            go({
                              action: "remove-sign-in-method",
                              method: i.provider,
                            })
                          }
                          aria-label={`Remove ${i.provider === "phone" ? "phone" : "Google"} sign-in`}
                        >
                          Remove
                        </button>
                      ) : (
                        <span className="settings-retained">
                          Your only method
                        </span>
                      )}
                    </article>
                  ))}
                </div>
                {action === "remove-sign-in-method" && (
                  <div className="settings-danger">
                    {identity && account.identities.length > 1 ? (
                      <>
                        <h3 ref={actionHeading} tabIndex={-1}>
                          Remove{" "}
                          {identity.provider === "phone" ? "phone" : "Google"}{" "}
                          sign-in?
                        </h3>
                        <p>
                          {identity.label} will no longer sign in to this
                          account. Your other sessions will be signed out. Keep
                          access to your remaining method before continuing.
                        </p>
                        <div className="settings-actions">
                          <button
                            className="button danger"
                            onClick={() =>
                              void act(
                                () =>
                                  api(
                                    "/account/methods/" + identity.provider,
                                    "DELETE",
                                    {},
                                  ),
                                "Sign-in method removed. Other sessions signed out.",
                              )
                            }
                          >
                            Confirm removal
                          </button>
                          <button
                            className="button secondary"
                            onClick={() => go({ action: "", method: "" })}
                          >
                            Keep method
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 ref={actionHeading} tabIndex={-1}>
                          Keep at least one sign-in method
                        </h3>
                        <p>
                          This method is unavailable or is your only way to sign
                          in.
                        </p>
                        <button
                          className="button secondary"
                          onClick={() => go({ action: "", method: "" })}
                        >
                          Back to methods
                        </button>
                      </>
                    )}
                  </div>
                )}
                <div className="settings-help">
                  <h3>Changing a phone number?</h3>
                  <p>
                    First link Google, then remove the old phone and verify the
                    new number. Linking or removing a method requires sign-in
                    within the last five minutes and signs out your other
                    devices.
                  </p>
                  <p>
                    If you lose access to one method, sign in with the other
                    linked method.
                  </p>
                </div>
              </>
            )}
          </>
        ) : section === "sessions" ? (
          <>
            <div className="settings-toolbar">
              <div>
                <h2 ref={heading} tabIndex={-1}>
                  Signed-in devices
                </h2>
                <p>
                  {account.sessions.length} active{" "}
                  {account.sessions.length === 1 ? "session" : "sessions"}. Your
                  current session stays signed in.
                </p>
              </div>
              <button
                className="button secondary"
                disabled={!otherSessions}
                onClick={() => go({ action: "sign-out-other-devices" })}
              >
                Sign out other devices
              </button>
            </div>
            {action === "sign-out-other-devices" && otherSessions > 0 && (
              <div className="settings-danger">
                <h3 ref={actionHeading} tabIndex={-1}>
                  Sign out {otherSessions} other{" "}
                  {otherSessions === 1 ? "session" : "sessions"}?
                </h3>
                <p>
                  Those devices will need to sign in again. This device stays
                  connected.
                </p>
                <div className="settings-actions">
                  <button
                    className="button danger"
                    onClick={() =>
                      void act(
                        () => api("/account/revoke-sessions", "POST", {}),
                        "Other sessions signed out.",
                      )
                    }
                  >
                    Confirm sign-out
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => go({ action: "" })}
                  >
                    Keep sessions
                  </button>
                </div>
              </div>
            )}
            <div className="settings-device-list">
              {account.sessions.map((s) => (
                <article key={s.id}>
                  <span className="settings-avatar">
                    <Monitor size={22} />
                  </span>
                  <div className="settings-person">
                    <strong>
                      {s.current ? "This device" : "Other session"}
                    </strong>
                    <small>
                      Signed in {formatWhen(s.createdAt, "dayTime")}
                    </small>
                    <details className="settings-device-detail">
                      <summary>Browser details</summary>
                      <p>{s.device || "Device information unavailable"}</p>
                    </details>
                  </div>
                  {s.current && <Badge tone="neutral">Current</Badge>}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="settings-empty">
            <h2>Account section unavailable</h2>
            <button
              className="button secondary"
              onClick={() =>
                go({
                  accountSection: "profile",
                  action: "",
                  form: "",
                  method: "",
                })
              }
            >
              Open profile
            </button>
          </div>
        )}
      </fieldset>
    </section>
  );
}
