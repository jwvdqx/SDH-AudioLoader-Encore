import { ConfirmModal, DialogButton, Focusable, ModalRoot, showModal, TextField, ToggleField } from "decky-frontend-lib";
import { useEffect, useRef, useState, VFC } from "react";
import { FaCheck, FaClock, FaDownload, FaExclamationTriangle, FaLock, FaPlay, FaSearch, FaStop, FaTimes } from "react-icons/fa";
import { Dropdown } from "decky-frontend-lib";
import { FocusButton } from "../menu/parts";
import { chip, smallButton } from "../components/look";
import { menuMusicControl, pauseMusicSmooth, resumeMusicSmooth } from "../audioPlayers";
import { Pack } from "../classes";
import { PackCard } from "./MyPacksPage";
import { arrange, LENGTH_OPTIONS, LengthKey, PAGE_SIZE_OPTIONS, SHOW_OPTIONS, ShowKey, SORT_OPTIONS, SortKey } from "./findOptions";
import { Direction, directionAfter, pagesToShow, preselected, showsEasterEgg } from "./pager";
import { useSettings } from "../menu/useSettings";
import * as python from "../python";
import { updateSetting } from "../settings";
import { formatBytes } from "./StoragePanel";

// Find Music: search YouTube or SoundCloud and add a song as a music pack.
// Off and greyed out until the user presses Set up: only then are the downloader tools fetched
// (see downloader_tools.py). Then: search (10 results a page), Download, a preview of the pack card
// (OK / Edit), and the download in the background (it pauses during games unless allowed).

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

/** YouTube asked to confirm "you're not a bot": a temporary block, explained. */
export const BlockedWarning: VFC<{ site: string; info: { since: number; error: string } }> = ({ site, info }) => {
  const name = SITE_NAMES[site] || site;
  const explain = () =>
    showModal(
      <ConfirmModal
        bAlertDialog
        strTitle={`${name} is asking to confirm you're not a bot`}
        strOKButtonText="OK"
        strDescription={
          <div style={{ fontSize: "13px", lineHeight: 1.55 }}>
            <p style={{ marginTop: 0 }}>
              {name} sometimes blocks downloads from a network for a while, when it sees many requests from it. This is not a
              broken yt-dlp, and no update fixes it: it goes away by itself, often within an hour.
            </p>
            <p>
              Encore already tried the other ways yt-dlp can talk to {name}. It does not sign in to your account (that would mean
              storing your login on the Deck). Try again later, or use SoundCloud meanwhile.
            </p>
            <p>
              <b>Your installed packs are not affected.</b>
            </p>
            <p style={{ opacity: 0.7, fontSize: "12px", marginBottom: 0 }}>
              Since {timeAgo(info.since)} · {info.error}
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
          background: "rgba(90, 60, 140, 0.55)",
          border: "1px solid rgba(201, 160, 255, 0.6)",
          color: "#eadcff",
          marginBottom: "10px",
        }}
      >
        <FaExclamationTriangle />
        <span>
          <b>{name} is asking to confirm you're not a bot.</b> A temporary block, not a broken yt-dlp. Try again later. Select for details.
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
          download fails. {deno?.installed
            ? `${(deno.version || "Deno").split(" (")[0]} is installed for YouTube (${formatBytes(deno.bytes || 0)}), and updated the same way.`
            : "Deno (for YouTube, about 90 MB) is only downloaded the first time you download from YouTube."}
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
        <li>For YouTube, <b>Deno</b> (about 90 MB, a JavaScript runtime YouTube's pages need) is downloaded the first time you download from YouTube, from its official GitHub releases. SoundCloud does not need it.</li>
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

// ---- the result cards



export const formatDuration = (s: number) => {
  if (!(s > 0)) return "";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
};



const ResultCard: VFC<{
  track: python.FoundTrack;
  onDownload: () => void;
  previewState: "" | "loading" | "playing";
  onPreview: () => void;
}> = ({ track, onDownload, previewState, onPreview }) => {
  const blocked = !!track.installed || track.preview_only;
  return (
    <div
      style={{
        width: "212px",
        borderRadius: "10px",
        overflow: "hidden",
        background: "linear-gradient(160deg, rgba(58, 30, 88, 0.75), rgba(20, 20, 44, 0.85))",
        border: "1px solid rgba(190, 140, 255, 0.2)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: "112px",
          position: "relative",
          backgroundColor: "#21323d",
          backgroundImage: track.thumbnail ? `url("${track.thumbnail}")` : "linear-gradient(135deg, #5a3a8a, #1e1e3a)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div style={{ position: "absolute", top: "6px", left: "6px", display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {track.installed && (
            <span style={chip("rgba(40, 150, 90, 0.95)")}>
              <FaCheck /> In My Packs
            </span>
          )}
          {track.preview_only && (
            <span style={chip("rgba(150, 60, 60, 0.95)")}>
              <FaLock /> Preview only
            </span>
          )}
        </div>
        <div style={{ position: "absolute", bottom: "6px", right: "6px", display: "flex", gap: "4px" }}>
          {track.long && (
            <span style={chip("rgba(200, 120, 30, 0.95)")}>
              <FaClock /> Long
            </span>
          )}
          {track.duration > 0 && <span style={chip("rgba(0, 0, 0, 0.7)")}>{formatDuration(track.duration)}</span>}
        </div>
      </div>
      <div style={{ padding: "8px 10px 4px", minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: "13px", lineHeight: 1.3, maxHeight: "34px", overflow: "hidden" }}>{track.title}</div>
        <div style={{ fontSize: "11px", opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {track.uploader}
        </div>
      </div>
      {/* @ts-ignore */}
      <Focusable flow-children="row" style={{ display: "flex", gap: "4px", padding: "4px 8px 8px" }}>
        <FocusButton style={{ ...smallButton(previewState !== ""), flex: "0 0 auto", width: "72px" }} onClick={onPreview}>
          {previewState === "playing" ? <FaStop /> : <FaPlay />}
          {previewState === "loading" ? "..." : previewState === "playing" ? "Stop" : "Listen"}
        </FocusButton>
        <FocusButton style={{ ...smallButton(), flex: 1 }} disabled={blocked} onClick={onDownload}>
          {track.installed ? "Already added" : track.preview_only ? "Preview only (Go+)" : (
            <>
              <FaDownload />
              Download
            </>
          )}
        </FocusButton>
      </Focusable>
    </div>
  );
};

// ---- the confirmation window: the pack card as it will look, OK / Edit, and the editor

// Our own lambda in an orange ring, for the last page number (not Valve's logo)
const Lambda: VFC = () => (
  <svg width="20" height="20" viewBox="0 0 40 40" aria-label="the end">
    <circle cx="20" cy="20" r="17" fill="none" stroke="#ff9d1a" strokeWidth="3.5" />
    <path d="M12 31 L19.5 17 L16.5 10.5 H21 L29 31 H25 L19.8 19.5 L15.8 31 Z" fill="#ff9d1a" />
  </svg>
);

const FIELDS: { key: keyof python.TrackDetails; label: string }[] = [
  { key: "name", label: "Pack name" },
  { key: "artist", label: "Artist" },
  { key: "description", label: "Description" },
];

const AddWindow: VFC<{
  track: python.FoundTrack;
  closeModal?: () => void;
  onStarted: () => void;
}> = ({ track, closeModal, onStarted }) => {
  const [details, setDetails] = useState<python.TrackDetails>({ ...track.fill });
  const [draft, setDraft] = useState<python.TrackDetails>({ ...track.fill });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const asPack = (d: python.TrackDetails): Pack =>
    ({
      name: d.name || "Untitled",
      author: d.artist || "Unknown",
      description: d.description,
      version: "v1.0",
      music: true,
      ignore: [],
      mappings: {},
      packPath: "",
      truncatedPackPath: "",
      hasIntro: false,
      id: `${track.site}:${track.id}`,
      source: { site: track.site, id: track.id, url: track.url },
    } as Pack);

  const ok = async () => {
    setBusy(true);
    setError("");
    const r = await python.findMusicDownload(track, details);
    setBusy(false);
    if (!r.ok) {
      setError(r.error || "Could not start the download.");
      return;
    }
    onStarted();
    closeModal?.();
  };

  const field = (key: keyof python.TrackDetails, label: string) => (
    // @ts-ignore
    <Focusable key={key} flow-children="row" style={{ display: "flex", gap: "8px", alignItems: "flex-end", marginBottom: "8px" }}>
      <div style={{ flex: 1 }}>
        <TextField label={label} value={draft[key]} onChange={(e: any) => setDraft({ ...draft, [key]: e.target.value })} />
      </div>
      <DialogButton
        aria-label={`Clear ${label}`}
        style={{ width: "40px", minWidth: "40px", padding: 0, height: "32px" }}
        onClick={() => setDraft({ ...draft, [key]: "" })}
      >
        <FaTimes />
      </DialogButton>
    </Focusable>
  );

  return (
    <ModalRoot closeModal={closeModal} onCancel={editing ? () => setEditing(false) : closeModal} bAllowFullSize>
      {!editing ? (
        <div style={{ display: "flex", gap: "24px", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "1.3em", fontWeight: 700, marginBottom: "4px" }}>Add to My Packs?</div>
            <div style={{ fontSize: "12px", opacity: 0.75, marginBottom: "14px" }}>This is how it will look in your library.</div>
            <Focusable style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "220px" }}>
              <DialogButton disabled={busy} onClick={ok}>
                {busy ? "Starting..." : "OK"}
              </DialogButton>
              <DialogButton disabled={busy} onClick={() => { setDraft({ ...details }); setEditing(true); }}>
                Edit
              </DialogButton>
            </Focusable>
            {error !== "" && <div style={{ color: "#ff9b9b", fontSize: "12px", marginTop: "10px" }}>{error}</div>}
          </div>
          <PackCard
            pack={asPack(details)}
            coverUrl={details.cover}
            previewOnly
            apiUrl=""
            playing={false}
            inUse={false}
            favorite={false}
            blocked={false}
            plays={0}
            onPlayOrUse={() => {}}
            onFavorite={() => {}}
            onBlock={() => {}}
            onUpdate={() => {}}
            onUninstall={() => {}}
            onInfo={() => {}}
          />
        </div>
      ) : (
        <div>
          <div style={{ fontSize: "1.3em", fontWeight: 700, marginBottom: "10px" }}>Edit Pack Details</div>
          {FIELDS.map((f) => field(f.key, f.label))}
          {/* @ts-ignore */}
          <Focusable flow-children="row" style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "6px",
                background: draft.cover ? `url("${draft.cover}") center / cover` : "linear-gradient(135deg, #5a3a8a, #1e1e3a)",
              }}
            />
            <div style={{ flex: 1, fontSize: "12px", opacity: 0.8 }}>
              {draft.cover ? "Cover: the track's picture" : "No cover (a music icon is shown)"}
            </div>
            {draft.cover ? (
              <DialogButton style={{ width: "40px", minWidth: "40px", padding: 0, height: "32px" }} onClick={() => setDraft({ ...draft, cover: "" })}>
                <FaTimes />
              </DialogButton>
            ) : track.fill.cover ? (
              <DialogButton style={{ width: "auto", minWidth: "120px" }} onClick={() => setDraft({ ...draft, cover: track.fill.cover })}>
                Use Picture
              </DialogButton>
            ) : null}
          </Focusable>
          {/* @ts-ignore */}
          <Focusable flow-children="row" style={{ display: "flex", gap: "8px" }}>
            <DialogButton
              style={{ width: "auto", minWidth: "120px" }}
              disabled={draft.name.trim() === ""}
              onClick={() => {
                setDetails({ ...draft, name: draft.name.trim() });
                setEditing(false);
              }}
            >
              Save
            </DialogButton>
            <DialogButton style={{ width: "auto", minWidth: "120px" }} onClick={() => setDraft({ name: "", artist: "", description: "", cover: "" })}>
              Clear All
            </DialogButton>
            <DialogButton style={{ width: "auto", minWidth: "120px" }} onClick={() => setEditing(false)}>
              Cancel
            </DialogButton>
          </Focusable>
          {draft.name.trim() === "" && <div style={{ fontSize: "12px", opacity: 0.7, marginTop: "8px" }}>A pack name is needed to save.</div>}
        </div>
      )}
    </ModalRoot>
  );
};

// ---- the download in progress

const JobBar: VFC<{ job: python.DownloadJob; onCancel: () => void }> = ({ job, onCancel }) => {
  const label =
    job.state === "paused"
      ? "Paused while a game runs, continues afterwards"
      : job.state === "preparing"
        ? "Setting up YouTube support (downloading Deno, about 90 MB, only this once)..."
        : job.state === "failed"
        ? job.blocked
          ? "YouTube asked to confirm you're not a bot. Try again later."
          : `Failed: ${job.error}`
        : job.state === "done"
          ? "Added to My Packs"
          : `Downloading ${Math.round(job.progress)}%`;
  const active = ["downloading", "starting", "paused", "preparing"].includes(job.state);
  return (
    // @ts-ignore
    <Focusable flow-children="row" style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "12px" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "12px", marginBottom: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <b>{job.name}</b> · <span style={{ color: job.state === "failed" ? "#ff9b9b" : ACCENT }}>{label}</span>
        </div>
        <div style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.1)", overflow: "hidden" }}>
          <div
            style={{
              width: `${job.state === "done" ? 100 : Math.max(2, job.progress)}%`,
              height: "100%",
              background: job.state === "failed" ? "#ff7b7b" : job.state === "paused" ? "#c98a4f" : ACCENT,
              transition: "width 0.4s",
            }}
          />
        </div>
      </div>
      {active && (
        <DialogButton style={{ width: "auto", minWidth: "100px" }} onClick={onCancel}>
          Cancel
        </DialogButton>
      )}
    </Focusable>
  );
};

// ---- the page

const SITES = [
  { id: "soundcloud", label: "SoundCloud", ready: true },
  { id: "youtube", label: "YouTube", ready: true },
];

// ---- options: results per page, sort and filters (on the page that is shown)

const Option: VFC<{ label: string; value: any; options: { data: any; label: string }[]; onChange: (v: any) => void }> = ({
  label,
  value,
  options,
  onChange,
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
    <span style={{ fontSize: "12px", opacity: 0.7 }}>{label}</span>
    <div style={{ minWidth: "130px" }}>
      <Dropdown rgOptions={options} selectedOption={value} onChange={(o) => onChange(o.data)} />
    </div>
  </div>
);

// Listening before downloading: one song at a time. The menu music pauses meanwhile, and continues
// when the preview stops (or the page is left).
function usePreview() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const pausedMusic = useRef<any>(null);
  const [current, setCurrent] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const keyOf = (t: python.FoundTrack) => `${t.site}:${t.id}`;

  // resumeMusic false: another preview starts right away, the menu music stays paused
  const stop = (resumeMusic = true) => {
    if (audio.current) {
      audio.current.pause();
      audio.current.src = "";
      audio.current = null;
    }
    setCurrent("");
    setLoading("");
    if (!resumeMusic) return;
    const music = pausedMusic.current;
    pausedMusic.current = null;
    if (music) {
      menuMusicControl.pausedByOtherPlugin = false;
      Promise.resolve(resumeMusicSmooth(music)).catch(() => {});
    }
  };

  const toggle = async (t: python.FoundTrack) => {
    const key = keyOf(t);
    if (current === key || loading === key) {
      stop();
      return;
    }
    stop(false);
    setError("");
    setLoading(key);
    const r = await python.findMusicStream(t.site, t.url);
    if (!r.ok || !r.url) {
      stop();
      setError(r.error === "blocked" ? "YouTube asked to confirm you're not a bot, try later" : r.error || "not available");
      return;
    }
    const live = python.liveState();
    const music = live.menuMusic;
    if (music && !music.paused && !pausedMusic.current) {
      // Paused on purpose: the music guard must not start it again during the preview
      menuMusicControl.pausedByOtherPlugin = true;
      pauseMusicSmooth(music);
      pausedMusic.current = music;
    }
    const el = new Audio(r.url);
    el.volume = Math.max(0.05, Math.min(1, Number(live.musicVolume) || 0.5));
    el.onended = () => stop();
    el.onerror = () => {
      setError("this song cannot be played here");
      stop();
    };
    audio.current = el;
    setLoading("");
    setCurrent(key);
    el.play().catch(() => {
      setError("the preview was refused");
      stop();
    });
  };

  // Leaving the page stops the preview
  useEffect(() => () => stop(), []);

  return {
    toggle,
    stop: () => stop(),
    error,
    stateOf: (t: python.FoundTrack): "" | "loading" | "playing" => (loading === keyOf(t) ? "loading" : current === keyOf(t) ? "playing" : ""),
  };
}

const SearchArea: VFC<{ onStatusChange: () => void }> = ({ onStatusChange }) => {
  const [site, setSite] = useState("soundcloud");
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<python.FoundTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [highestSeen, setHighestSeen] = useState(1);
  const [lastPage, setLastPage] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>("forward");
  const [focused, setFocused] = useState<number | null>(null);
  const [job, setJob] = useState<python.DownloadJob | null>(null);
  const [maxPages, setMaxPages] = useState(10);
  const [sort, setSort] = useState<SortKey>("relevance");
  const [length, setLength] = useState<LengthKey>("any");
  const [show, setShow] = useState<ShowKey>("all");
  const settingsNow = useSettings();
  const pageSize = settingsNow.find_music_page_size;
  const requestId = useRef(0);
  const preview = usePreview();

  const load = async (q: string, p: number, size = pageSize) => {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    const r = await python.findMusicSearch(site, q, p, size);
    if (id !== requestId.current) return; // a newer search started meanwhile
    setLoading(false);
    setResults(r.results);
    setPage(r.page);
    setMaxPages(r.max_pages || 10);
    setHighestSeen((h) => Math.max(h, r.page));
    if (r.last_page) setLastPage(r.page);
    // A broken site or a bot check has its own warning at the top of the page
    if (r.error === "broken" || r.error === "blocked") {
      setError("");
      onStatusChange();
    } else if (r.error) setError(r.error);
  };

  const newSearch = () => {
    const q = query.trim();
    if (q === "") return;
    setSearched(q);
    setHighestSeen(1);
    setLastPage(null);
    setDirection("forward");
    load(q, 1);
  };

  const goTo = (p: number) => {
    setDirection(directionAfter(page, p, direction));
    load(searched, p);
  };

  // The download: asked for every half second while one is running
  useEffect(() => {
    let stop = false;
    let timer: any = null;
    const tick = async () => {
      const j = await python.findMusicJob();
      if (stop) return;
      setJob(j);
      if (j && j.state === "done") {
        python.toast("Added to My Packs", j.name, 5000);
        await python.findMusicControl("clear");
        python.reloadBackend();
        if (searched) load(searched, page); // marks the track as added
      }
      if (j && j.state === "failed" && j.blocked) onStatusChange();
      timer = setTimeout(tick, j && ["preparing", "starting", "downloading", "paused"].includes(j.state) ? 500 : 3000);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [searched, page]);

  const changePageSize = (size: number) => {
    updateSetting("find_music_page_size", size);
    if (searched) {
      setHighestSeen(1);
      setLastPage(null);
      setDirection("forward");
      load(searched, 1, size);
    }
  };

  // Sorting and filters work on the page that is shown
  const visible = arrange(results, sort, length, show);

  const shown = pagesToShow(page, highestSeen, lastPage, maxPages);
  const target = preselected(page, shown, direction);

  return (
    <div>
      {job && <JobBar job={job} onCancel={() => python.findMusicControl("cancel").then(setJob)} />}
      {/* @ts-ignore */}
      <Focusable flow-children="row" style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px" }}>
        {SITES.map((s) => (
          <DialogButton
            key={s.id}
            disabled={!s.ready}
            onClick={() => setSite(s.id)}
            style={{
              width: "auto",
              minWidth: 0,
              padding: "6px 14px",
              background: site === s.id ? "linear-gradient(145deg, rgba(120, 70, 190, 0.85), rgba(60, 40, 110, 0.9))" : undefined,
              color: site === s.id ? "#fff" : undefined,
            }}
          >
            {s.label}
          </DialogButton>
        ))}
        <div style={{ flex: 1 }}>
          <TextField
            placeholder="Search songs or artists"
            value={query}
            onChange={(e: any) => setQuery(e.target.value)}
            {...({ onKeyDown: (e: any) => e.key === "Enter" && newSearch() } as any)}
          />
        </div>
        <DialogButton style={{ width: "auto", minWidth: "110px" }} disabled={loading || query.trim() === ""} onClick={newSearch}>
          <FaSearch style={{ marginRight: "6px" }} />
          Search
        </DialogButton>
      </Focusable>
      {/* Options, compact: each one is a dropdown */}
      {/* @ts-ignore */}
      <Focusable flow-children="row" style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
        <Option label="Per page" value={pageSize} options={PAGE_SIZE_OPTIONS} onChange={(v) => changePageSize(Number(v))} />
        <Option label="Sort" value={sort} options={SORT_OPTIONS.filter((o) => o.data !== "views" || site === "youtube")} onChange={(v) => setSort(v as SortKey)} />
        <Option label="Length" value={length} options={LENGTH_OPTIONS} onChange={(v) => setLength(v as LengthKey)} />
        <Option label="Show" value={show} options={SHOW_OPTIONS} onChange={(v) => setShow(v as ShowKey)} />
        {preview.error !== "" && <span style={{ fontSize: "12px", color: "#ff9b9b" }}>Preview: {preview.error}</span>}
      </Focusable>

      {loading && <div style={{ opacity: 0.75, margin: "12px 0" }}>Searching...</div>}
      {!loading && error !== "" && <div style={{ color: "#ff9b9b", margin: "12px 0", fontSize: "13px" }}>Search failed: {error}</div>}
      {!loading && searched !== "" && results.length === 0 && error === "" && <div style={{ opacity: 0.75, margin: "12px 0" }}>Nothing found.</div>}

      {!loading && results.length > 0 && (
        <>
          <Focusable style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
            {visible.map((t) => (
              <ResultCard
                key={`${t.site}:${t.id}`}
                track={t}
                previewState={preview.stateOf(t)}
                onPreview={() => preview.toggle(t)}
                onDownload={() => {
                  preview.stop();
                  showModal(<AddWindow track={t} onStarted={() => python.findMusicJob().then(setJob)} />);
                }}
              />
            ))}
            {visible.length === 0 && <div style={{ opacity: 0.75 }}>Nothing on this page matches the Length and Show options.</div>}
          </Focusable>
          {/* The page numbers. Entering them selects the page most likely wanted next. */}
          <Focusable
            // @ts-ignore
            flow-children="row"
            {...({ navEntryPreferPosition: 4 } as any)}
            style={{ display: "flex", gap: "6px", justifyContent: "center", margin: "18px 0 6px" }}
          >
            {Array.from({ length: shown }, (_, i) => i + 1).map((n) => {
              const egg = showsEasterEgg(n, page, shown, lastPage, direction, maxPages) && focused === n;
              return (
                <DialogButton
                  key={n}
                  {...({ preferredFocus: n === target, autoFocus: false } as any)}
                  onGamepadFocus={() => setFocused(n)}
                  onGamepadBlur={() => setFocused((f) => (f === n ? null : f))}
                  onClick={() => n !== page && goTo(n)}
                  style={{
                    width: "40px",
                    minWidth: "40px",
                    height: "40px",
                    padding: 0,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: n === page ? 800 : 500,
                    color: n === page ? "#fff" : undefined,
                    background: n === page ? "linear-gradient(145deg, rgba(120, 70, 190, 0.95), rgba(60, 40, 110, 0.95))" : undefined,
                    boxShadow: egg ? "0 0 12px rgba(255, 157, 26, 0.8)" : undefined,
                  }}
                >
                  {egg ? <Lambda /> : n}
                </DialogButton>
              );
            })}
          </Focusable>
          <div style={{ textAlign: "center", fontSize: "11px", opacity: 0.6 }}>
            Page {page}
            {lastPage !== null ? ` of ${lastPage}` : ""}
          </div>
        </>
      )}
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
      {Object.entries(status.blocked || {}).map(([site, info]) => (
        <BlockedWarning key={"b" + site} site={site} info={info} />
      ))}
      {ready ? (
        <>
          <SearchArea onStatusChange={() => python.toolsStatus().then((s) => s && setStatus(s))} />
          <div style={{ height: "24px" }} />
          <DownloaderPanel status={status} onStatus={setStatus} />
        </>
      ) : (
        <>
          {/* The search, greyed out until Find Music is set up */}
          <div style={{ opacity: 0.35, pointerEvents: "none", marginBottom: "14px" }}>
            <Focusable style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <DialogButton style={{ width: "auto", minWidth: 0, padding: "6px 14px" }} disabled>
                SoundCloud
              </DialogButton>
              <div style={{ flex: 1 }}>
                <TextField disabled placeholder="Search songs or artists" value="" />
              </div>
              <DialogButton style={{ width: "auto", minWidth: 0, padding: "6px 14px" }} disabled>
                <FaSearch />
              </DialogButton>
            </Focusable>
          </div>
          <SetupCard onDone={setStatus} />
        </>
      )}
    </div>
  );
};
