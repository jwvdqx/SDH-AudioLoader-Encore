import { ConfirmModal, Focusable, showModal } from "decky-frontend-lib";
import { useEffect, useState, VFC } from "react";
import * as python from "../python";
import { EncoreButton } from "../menu/parts";

// Storage: one bar for the whole drive (like Steam's own storage page), in Encore's colours, with
// each part of Encore, everything else and free space. Below it, the list, and a clean-up of files
// that are safe to delete (storage.py decides; it never deletes packs, settings or tools in use).

const ACCENT = "#c9a0ff";

export const PARTS: { key: string; label: string; color: string; note?: string }[] = [
  { key: "music", label: "Music packs", color: "#b07cff" },
  { key: "downloaded", label: "Downloaded music (Find Music)", color: "#e08cff" },
  { key: "sounds", label: "Sound packs", color: "#6aa8ff" },
  { key: "tools", label: "Downloader tools", color: "#ffb86a" },
  { key: "tools_previous", label: "Previous tool versions (kept for Undo)", color: "#c98a4f" },
  { key: "logs", label: "Logs", color: "#8fd18f" },
  { key: "settings", label: "Settings & caches", color: "#7fe0d0" },
  { key: "leftovers", label: "Leftovers (temporary files)", color: "#ff7b7b" },
  { key: "steam_links", label: "Steam Music links", color: "#d0d0e0", note: "links only: the soundtracks are Steam's files" },
];

export function formatBytes(n: number): string {
  if (!(n > 0)) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / Math.pow(1024, i);
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

const Swatch: VFC<{ color: string }> = ({ color }) => (
  <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "2px", background: color, flex: "0 0 auto" }} />
);

export const StoragePanel: VFC = () => {
  const [usage, setUsage] = useState<python.StorageUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = () => python.storageUsage().then(setUsage);
  useEffect(() => {
    refresh();
  }, []);

  const cleanUp = async () => {
    setBusy(true);
    const plan = await python.storageCleanupPlan();
    setBusy(false);
    if (plan.length === 0) {
      setMessage("Nothing to clean up.");
      return;
    }
    const total = plan.reduce((n, i) => n + i.bytes, 0);
    showModal(
      <ConfirmModal
        strTitle={`Clean up ${formatBytes(total)}?`}
        strOKButtonText="Delete"
        strDescription={
          <div style={{ fontSize: "13px", lineHeight: 1.5 }}>
            <div style={{ marginBottom: "8px" }}>These files are safe to delete. Packs, your settings and the tools in use are never touched.</div>
            <div style={{ maxHeight: "40vh", overflow: "auto" }}>
              {plan.map((i) => (
                <div key={i.id} style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <span style={{ overflowWrap: "anywhere" }}>{i.label}</span>
                  <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>{formatBytes(i.bytes)}</span>
                </div>
              ))}
            </div>
          </div>
        }
        onOK={async () => {
          setBusy(true);
          const r = await python.storageCleanup(plan.map((i) => i.id));
          setBusy(false);
          setMessage(r ? `Freed ${formatBytes(r.freed)}.` : "Could not clean up.");
          refresh();
        }}
      />
    );
  };

  const encore = usage ? PARTS.reduce((n, p) => n + (usage.parts[p.key] || 0), 0) : 0;
  const drive = usage?.drive;
  const other = drive ? Math.max(0, drive.used - encore) : 0;
  const pct = (n: number) => (drive && drive.total > 0 ? (n / drive.total) * 100 : 0);
  // Tiny parts still get a visible sliver
  const width = (n: number) => (n > 0 ? `max(${pct(n)}%, 3px)` : "0");

  return (
    <div style={{ marginTop: "16px" }}>
      <div style={{ fontWeight: 700, fontSize: "1.4em", marginBottom: "6px" }}>Storage</div>
      {!usage || !drive ? (
        <div style={{ opacity: 0.7 }}>Measuring...</div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", opacity: 0.8, marginBottom: "4px" }}>
            <span>
              Encore uses <b style={{ color: ACCENT }}>{formatBytes(encore)}</b>
            </span>
            <span>
              {formatBytes(drive.free)} free of {formatBytes(drive.total)}
            </span>
          </div>
          <div
            style={{
              display: "flex",
              height: "18px",
              borderRadius: "6px",
              overflow: "hidden",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(190, 140, 255, 0.28)",
            }}
          >
            {PARTS.map((p) => (
              <div key={p.key} style={{ width: width(usage.parts[p.key] || 0), background: p.color }} />
            ))}
            <div style={{ width: `${pct(other)}%`, background: "#4a4f5c" }} />
          </div>
          {/* The same parts, scaled to Encore's own total, so small parts can be told apart */}
          <div style={{ fontSize: "12px", opacity: 0.8, margin: "10px 0 4px" }}>Inside Encore</div>
          <div
            style={{
              display: "flex",
              height: "12px",
              borderRadius: "4px",
              overflow: "hidden",
              background: "rgba(255,255,255,0.08)",
            }}
          >
            {PARTS.map((p) => (
              <div
                key={p.key}
                style={{
                  width: encore > 0 && usage.parts[p.key] > 0 ? `max(${(usage.parts[p.key] / encore) * 100}%, 2px)` : "0",
                  background: p.color,
                }}
              />
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 16px", fontSize: "13px", marginTop: "10px" }}>
            {PARTS.filter((p) => (usage.parts[p.key] || 0) > 0 || ["music", "sounds"].includes(p.key)).map((p) => (
              <>
                <span key={p.key + "l"} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Swatch color={p.color} />
                  {p.label}
                  {p.key in usage.counts ? <span style={{ opacity: 0.6 }}>({usage.counts[p.key]})</span> : null}
                  {p.note ? <span style={{ opacity: 0.6, fontSize: "11px" }}>{p.note}</span> : null}
                </span>
                <span key={p.key + "v"} style={{ opacity: 0.8, textAlign: "right" }}>
                  {formatBytes(usage.parts[p.key] || 0)}
                </span>
              </>
            ))}
            <span style={{ display: "flex", alignItems: "center", gap: "8px", opacity: 0.7 }}>
              <Swatch color="#4a4f5c" />
              Everything else on the drive
            </span>
            <span style={{ opacity: 0.6, textAlign: "right" }}>{formatBytes(other)}</span>
          </div>
        </>
      )}
      <Focusable style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" }}>
        <EncoreButton style={{ width: "auto", minWidth: "160px" }} disabled={busy} onClick={cleanUp}>
          {busy ? "Working..." : "Clean Up..."}
        </EncoreButton>
        <span style={{ fontSize: "12px", opacity: 0.75 }}>{message}</span>
      </Focusable>
    </div>
  );
};
