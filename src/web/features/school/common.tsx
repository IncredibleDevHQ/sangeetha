import { useCallback, useState } from "react";
import { api } from "../../lib/api";
export type Row = Record<string, unknown> & { id: string };
export type School = { id: string; name: string; role: string };
export const text = (r: Record<string, unknown>, key: string) =>
  String(r[key] ?? "");
export const num = (r: Record<string, unknown>, key: string) =>
  Number(r[key] ?? 0);
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    paise / 100,
  );
export const today = () =>
  new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
export function useSchool(school: School) {
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const prefix = "/schools/" + school.id;
  const read = useCallback(
    <T,>(view: string, query = "") => api<T>(prefix + "/views/" + view + query),
    [prefix],
  );
  const command = useCallback(
    async <T,>(action: string, body: unknown): Promise<T | undefined> => {
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const result = await api<T>(
          prefix + "/commands/" + action,
          "POST",
          body,
        );
        setMessage("Saved.");
        return result;
      } catch (e) {
        setError((e as Error).message);
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [prefix],
  );
  const download = useCallback(
    (name: string, data: string, type = "text/csv") => {
      const blob = new Blob([data], { type }),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
    [],
  );
  return { school, read, command, error, setError, message, busy, download };
}
export type SchoolTools = ReturnType<typeof useSchool>;
export function Alerts({ tools }: { tools: SchoolTools }) {
  return (
    <>
      {tools.error && (
        <div className="alert" role="alert">
          {tools.error}
        </div>
      )}
      {tools.message && (
        <div className="success" role="status">
          {tools.message}
        </div>
      )}
    </>
  );
}
export function Select({
  label,
  value,
  onChange,
  rows,
  labelKey = "name",
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows: Row[];
  labelKey?: string;
  optional?: boolean;
}) {
  return (
    <label>
      {label}
      <select
        required={!optional}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose…</option>
        {rows.map((r) => (
          <option key={r.id} value={r.id}>
            {text(r, labelKey)}
          </option>
        ))}
      </select>
    </label>
  );
}
