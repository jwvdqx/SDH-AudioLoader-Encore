import { ConfirmModal, DialogButton, Focusable, showModal, TextField, ToggleField } from "decky-frontend-lib";
import { useEffect, useState, VFC } from "react";
import { FaDownload, FaExclamationTriangle, FaSearch } from "react-icons/fa";
import { useSettings } from "../menu/useSettings";
import * as python from "../python";
import { updateSetting } from "../settings";
import { formatBytes } from "./StoragePanel";

// Find Music: search YouTube or SoundCloud and add a song as a music pack.
// Off and greyed out until the user presses Set up: only then are the downloader tools fetched
// (see downloader_tools.py). Search and download come in the next step; this page already shows the
// setup, the tools and the warning for when yt-dlp is broken.

const ACCENT = "#c9a0ff";
const SITE_NAMES: Record<string, string> = { youtube: "YouTube", soundcloud: "SoundCloud" };

const timeAgo = (seconds?: number) => {
  if (!seconds) return "never";
  const s = Math.max(0, Date.now() / 1000 - seconds);
  if (s < 90) return "just now";
  if (s < 5400) return `${Math.round(s / 60)} minutes ago`;
  if (s < 129600) return `${Math.round(s / 3600)} hours ago`;
  return `${Math.round(s / 86400)} days ago`;
};

/** The warning shown while yt-dlp cannot download from a site. */
export const BrokenWarning: VFC<{ site: string; info: { since: number; error: string; version?: string } }> = ({ site, info }) => {
  const name = SITE_NAMES[site] || site;
  const explain = () =>
    showModal(
      <ConfirmModal
        bAlertDialog
        strTitle={`${name} downloads are not working right now`}
        strOKButtonText="OK"
        strDescription={
          <div style={{ fontSize: "13px", lineHeight: 1.55 }}>
            <p style={{ marginTop: 0 }}>
              Encore doesn't download from {name} itself. It uses <b>yt-dlp</b>, a free open-source downloader that a volunteer
              team maintains. {name} doesn't offer an official way to download, and it changes its site often. When it does,
              yt-dlp stops working until its team releases a fix, usually within a few days.
            </p>
            <p>
              Encore has already tried every way it can: the newest and the previous yt-dlp version, the nightly version, and
              other connection methods. Now it has to wait for that fix. It checks for one automatically, and this message
              disappears once downloads work again.
            </p>
            <p>
              <b>Your installed packs are not affected.</b> Only adding new music from {name} is paused.
              {site === "youtube" ? " SoundCloud may still work." : ""}
            </p>
            <p style={{ opacity: 0.7, fontSize: "12px", marginBottom: 0 }}>
              yt-dlp {info.version || "?"} · broken since {timeAgo(info.since)} · {info.error}
            </p>
          </div>
        }
      />
    );
  return (
    <Focusable>
      <DialogButton
        onClick={explain}
        style={{
          width: "100%",
          textAlign: "left",
          display: "flex",
          gap: "10px",
          alignItems: "center",
          background: "rgba(150, 90, 20, 0.55)",
          border: "1px solid rgba(255, 184, 106, 0.6)",
          color: "#ffe2bd",
          marginBottom: "10px",
        }}
      >
        <FaExclamationTriangle />
        <span>
          <b>yt-dlp is broken for {name}, awaiting fixes.</b> Your packs are not affected. Select for details.
        </span>
      </DialogButton>
    </Focusable>
  );
};

/** yt-dlp's version, update, undo, remove, and the "keep downloading during games" switch. */
export const DownloaderPanel: VFC<{ status: python.ToolsStatus; onStatus: (s: python.ToolsStatus) => void }> = ({ status, onStatus }) => {
  const settings = useSettings();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const tool = status.tools["yt-dlp"] || ({} as python.ToolInfo);
  const deno = status.tools["deno"];

  const act = async (action: "update" | "undo" | "remove") => {
    setBusy(action);
    setMessage("");
    const r = await python.toolsAction(action);
    setBusy("");
    if (r.status) onStatus(r.status);
    if (!r.ok) setMessage(`Could not ${action}: ${r.error}`);
    else if (action === "update") setMessage(r.status?.tools["yt-dlp"]?.version === tool.version ? "Already the newest version." : "Updated.");
    else if (action === "undo") setMessage("Went back to the previous version.");
    else setMessage("Removed. Find Music is off again.");
  };

  return (
    <div style={{ fontSize: "13px" }}>
      <div style={{ fontWeight: 700, fontSize: "1.4em", marginBottom: "6px" }}>Downloader</div>
      <div style={{ opacity: 0.85, lineHeight: 1.6 }}>
        <div>
          yt-dlp <b style={{ color: ACCENT }}>{tool.version || "-"}</b> ({tool.channel || "stable"}) · {formatBytes(tool.bytes || 0)} ·
          checked {timeAgo(tool.last_check)}
          {tool.last_ok ? ` · last worked ${timeAgo(tool.last_ok)}` : ""}
        </div>
        <div style={{ opacity: 0.75, fontSize: "12px" }}>
          From yt-dlp's official GitHub releases, checksum checked. New versions are looked for once a day, and right away when a
          download fails. {deno?.installed ? `Deno ${deno.version || ""} is installed for YouTube.` : "Deno (for YouTube) is only downloaded the first time you use YouTube."}
        </div>
      </div>
      <Focusable style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "8px 0" }}>
        <DialogButton style={{ width: "auto", minWidth: "140px" }} disabled={!!busy} onClick={() => act("update")}>
          {busy === "update" ? "Checking..." : "Update Now"}
        </DialogButton>
        <DialogButton
          style={{ width: "auto", minWidth: "140px" }}
          disabled={!!busy || !tool.has_previous}
          onClick={() => act("undo")}
        >
          Undo Last Update{tool.previous?.version ? ` (${tool.previous.version})` : ""}
        </DialogButton>
        <DialogButton
          style={{ width: "auto", minWidth: "140px", color: "#ff9b9b" }}
          disabled={!!busy}
          onClick={() =>
            showModal(
              <ConfirmModal
                strTitle="Remove the downloader?"
                strDescription="yt-dlp (and Deno, if it was downloaded) are deleted and Find Music is switched off. Songs you added stay. You can set it up again at any time."
                strOKButtonText="Remove"
                onOK={() => act("remove")}
              />
            )
          }
        >
          Remove
        </DialogButton>
      </Focusable>
      {message !== "" && <div style={{ fontSize: "12px", color: ACCENT, marginBottom: "6px" }}>{message}</div>}
      <ToggleField
        label="Keep Downloading While a Game Runs"
        description="Off: downloads pause when a game starts and continue where they stopped afterwards."
        checked={settings.download_during_games}
        onChange={(value) => updateSetting("download_during_games", value)}
      />
    </div>
  );
};

/** Shown before Set up: what will be downloaded, from where, and why. */
const SetupCard: VFC<{ onDone: (s: python.ToolsStatus) => void }> = ({ onDone }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const setUp = async () => {
    setBusy(true);
    setError("");
    const r = await python.toolsAction("setup");
    setBusy(false);
    if (r.ok && r.status) onDone(r.status);
    else setError(r.error || "Set up failed.");
  };
  return (
    <div
      style={{
        maxWidth: "720px",
        margin: "0 auto",
        padding: "18px 20px",
        borderRadius: "10px",
        background: "linear-gradient(160deg, rgba(58, 30, 88, 0.85), rgba(20, 20, 44, 0.9))",
        border: "1px solid rgba(190, 140, 255, 0.35)",
        fontSize: "13px",
        lineHeight: 1.55,
      }}
    >
      <div style={{ fontSize: "1.5em", fontWeight: 700, marginBottom: "6px" }}>Set up Find Music</div>
      <div>
        Find Music searches SoundCloud and YouTube and adds a song as a music pack. It is off until you set it up, so nothing is
        downloaded or run without your say.
      </div>
      <ul style={{ margin: "10px 0", paddingLeft: "20px" }}>
        <li>
          Set up downloads <b>yt-dlp</b> (about 40 MB), a free open-source downloader, only from its official GitHub releases.
          Its checksum is checked before it is used.
        </li>
        <li>For YouTube, <b>Deno</b> (about 40 MB) is downloaded the first time you use YouTube. SoundCloud does not need it.</li>
        <li>They are kept up to date automatically (checked once a day), and you can remove them at any time.</li>
        <li>Only download music you have the right to use, and follow the sites' terms. Songs stay on this Deck.</li>
      </ul>
      {/* @ts-ignore */}
      <Focusable flow-children="row" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <DialogButton style={{ width: "auto", minWidth: "220px" }} disabled={busy} onClick={setUp}>
          <FaDownload style={{ marginRight: "8px" }} />
          {busy ? "Setting up..." : "Set Up Find Music"}
        </DialogButton>
        {error !== "" && <span style={{ color: "#ff9b9b" }}>{error}</span>}
      </Focusable>
    </div>
  );
};

export const FindMusicPage: VFC = () => {
  const [status, setStatus] = useState<python.ToolsStatus | null>(null);
  useEffect(() => {
    python.toolsStatus().then(setStatus);
  }, []);

  if (!status) return <div style={{ padding: "1em 2.8vw", opacity: 0.7 }}>Loading...</div>;

  const ready = status.setup;
  return (
    <div style={{ padding: "10px 2.8vw 2em" }}>
      {Object.entries(status.broken || {}).map(([site, info]) => (
        <BrokenWarning key={site} site={site} info={info} />
      ))}
      {/* The search, greyed out until Find Music is set up */}
      <div style={{ opacity: ready ? 1 : 0.35, pointerEvents: ready ? "auto" : "none", marginBottom: "14px" }}>
        <Focusable style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <DialogButton style={{ width: "auto", minWidth: 0, padding: "6px 14px" }} disabled={!ready}>
            SoundCloud
          </DialogButton>
          <DialogButton style={{ width: "auto", minWidth: 0, padding: "6px 14px" }} disabled={!ready}>
            YouTube
          </DialogButton>
          <div style={{ flex: 1 }}>
            <TextField disabled placeholder="Search songs" value="" />
          </div>
          <DialogButton style={{ width: "auto", minWidth: 0, padding: "6px 14px" }} disabled={!ready}>
            <FaSearch />
          </DialogButton>
        </Focusable>
        {ready && (
          <div style={{ fontSize: "12px", opacity: 0.75, marginTop: "8px" }}>
            Search and adding songs arrive in the next update. The downloader is ready.
          </div>
        )}
      </div>
      {ready ? <DownloaderPanel status={status} onStatus={setStatus} /> : <SetupCard onDone={setStatus} />}
    </div>
  );
};
