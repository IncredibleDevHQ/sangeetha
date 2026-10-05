import { useRouteValue } from "../../routes";
import { useCallback, useEffect, useState } from "react";
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
    [busy, setBusy] = useState(false),
    [exportFile, setExportFile] = useState<{
      name: string;
      url: string;
    } | null>(null);
  useEffect(() => {
    return () => {
      if (exportFile) URL.revokeObjectURL(exportFile.url);
    };
  }, [exportFile]);
  const [page] = useRouteValue("page");
  const [module] = useRouteValue("module");
  const [report] = useRouteValue("report");
  const [section] = useRouteValue("section");
  const [occurrence] = useRouteValue("occurrence");
  const [household] = useRouteValue("household");
  const [familyView] = useRouteValue("familyView");
  const [event] = useRouteValue("event");
  const [integration] = useRouteValue("integration");
  const [paymentLink] = useRouteValue("link");
  useEffect(() => {
    setError("");
    setMessage("");
    setExportFile(null);
  }, [
    page,
    module,
    report,
    section,
    occurrence,
    household,
    familyView,
    event,
    integration,
    paymentLink,
    school.id,
  ]);
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
      setExportFile({ name, url });
      a.hidden = true;
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    [],
  );
  return {
    school,
    read,
    command,
    error,
    setError,
    message,
    busy,
    download,
    exportFile,
    dismissExport: () => setExportFile(null),
  };
}
export type SchoolTools = ReturnType<typeof useSchool>;
export function Alerts({ tools }: { tools: SchoolTools }) {
  return (
    <>
      {tools.exportFile && (
        <div className="export-notice" role="status">
          <span>
            Export ready: <strong>{tools.exportFile.name}</strong>
          </span>
          <a href={tools.exportFile.url} download={tools.exportFile.name}>
            Download file
          </a>
          <button
            className="button secondary"
            onClick={tools.dismissExport}
            aria-label="Dismiss export notice"
          >
            Dismiss
          </button>
        </div>
      )}
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
