import { rememberAuthDestination } from "../../routes";
import PhoneInput from "./PhoneInput";
import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, ArrowRight, Phone } from "lucide-react";
import { api } from "../../lib/api";
export default function SignIn({
  local,
  link = false,
  onDone,
  onError,
}: {
  local: boolean;
  link?: boolean;
  onDone: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [method, setMethod] = useState<"email" | "phone">("email"),
    [destination, setDestination] = useState(
      link ? "" : "teacher@example.test",
    ),
    [flow, setFlow] = useState<{ id: string; code: string } | null>(null),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  async function request(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    onError("");
    try {
      setFlow(
        await api("/auth/local/start", "POST", {
          channel: method,
          destination,
        }),
      );
      setCooldown(30);
      setCode("");
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function complete(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    onError("");
    try {
      await api("/auth/local/complete", "POST", { id: flow!.id, code, link });
      await onDone();
    } catch (e) {
      onError((e as Error).message);
      setFlow(null);
    } finally {
      setBusy(false);
    }
  }
  if (!local)
    return (
      <div className="sign-options">
        <a
          className="button google"
          onClick={rememberAuthDestination}
          href={"/api/auth/start/google" + (link ? "?link=1" : "")}
        >
          <span className="google-g">G</span>Continue with Google
          <ArrowRight size={17} />
        </a>
        <div className="divider">or</div>
        <a
          className="button secondary"
          onClick={rememberAuthDestination}
          href={"/api/auth/start/phone" + (link ? "?link=1" : "")}
        >
          <Phone size={18} />
          Continue with phone
          <ArrowRight size={17} />
        </a>
        <p className="fine">
          Enter your mobile number with its country code on the secure sign-in
          page. Your SMS code verifies your number.
        </p>
      </div>
    );
  return (
    <div>
      <div className="notice">
        <ShieldCheck size={18} />
        <div>
          <strong>Local sign-in simulator</strong>
          <p>
            No Google verification or SMS delivery. Use teacher@example.test for
            the seeded owner.
          </p>
        </div>
      </div>
      <div className="tabs">
        <button
          type="button"
          className={method === "email" ? "selected" : ""}
          onClick={() => {
            setMethod("email");
            setFlow(null);
            setDestination(link ? "" : "teacher@example.test");
          }}
        >
          Google account
        </button>
        <button
          type="button"
          className={method === "phone" ? "selected" : ""}
          onClick={() => {
            setMethod("phone");
            setFlow(null);
            setDestination("");
          }}
        >
          Phone
        </button>
      </div>
      {!flow ? (
        <form onSubmit={request}>
          {method === "phone" ? (
            <PhoneInput
              value={destination}
              onChange={setDestination}
              required
            />
          ) : (
            <label>
              Email address for local simulation
              <input
                autoComplete="email"
                type="email"
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="you@example.com"
              />
            </label>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Requesting…" : "Request verification code"}
            <ArrowRight size={17} />
          </button>
        </form>
      ) : (
        <form onSubmit={complete}>
          <p className="fine">
            Verification for <strong>{destination}</strong>
          </p>
          <div className="demo-code">
            Local test code: <strong>{flow.code}</strong>
            <span>Expires in 5 minutes · single use</span>
          </div>
          <label>
            Verification code
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6-digit code"
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy
              ? "Verifying…"
              : link
                ? "Verify and link method"
                : "Enter workspace"}
            <ArrowRight size={17} />
          </button>
          <div className="form-footer">
            <button
              type="button"
              className="text-button"
              disabled={busy || cooldown > 0}
              onClick={() => request()}
            >
              {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setFlow(null)}
            >
              Change contact
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
