import {
  ConfirmModal,
  DialogButton,
  Focusable,
  Router,
  showModal,
  TextField,
} from "decky-frontend-lib";
import { CSSProperties, ReactNode, useEffect, useMemo, useState, VFC } from "react";
import {
  FaBan,
  FaCheck,
  FaInfoCircle,
  FaMusic,
  FaPlay,
  FaRegStar,
  FaStar,
  FaSyncAlt,
  FaTrash,
  FaVolumeUp,
} from "react-icons/fa";
import { genericGET } from "../api";
import { MinimalCSSThemeInfo } from "../apiTypes";
import { changeMenuMusic } from "../audioPlayers";
import { Pack } from "../classes";
import { playMusicByHand, useSoundPack } from "../menu/actions";
import { useSettings } from "../menu/useSettings";
import * as python from "../python";
import { updateSetting } from "../settings";
import { useGlobalState } from "../state";

// "My Packs": every installed pack as a card in a grid, with its information and quick buttons
// (play / use, favorite, never pick, update, uninstall, details). Replaces the old Uninstall list.
// Steam soundtrack tracks are not shown here (there can be hundreds): they have the Steam Music tab.

type Filter = "all" | "music" | "sounds";
type Sort = "name" | "most" | "least";
const SORT_LABELS: Record<Sort, string> = {
  name: "Name",
  most: "Most played",
  least: "Least played",
};
const NEXT_SORT: Record<Sort, Sort> = { name: "most", most: "least", least: "name" };

const ACCENT = "#c9a0ff";
const DEFAULT_SOUNDS = "Default";

type RemoteInfo = {
  status: "installed" | "outdated" | "local";
  remote?: MinimalCSSThemeInfo & { images?: { id: string }[] };
};

// Asks the pack website which installed packs have a newer version (and gets their pictures)
function useRemoteInfo(packs: Pack[]): Record<string, RemoteInfo> {
  const { browseThemeList } = useGlobalState();
  const [info, setInfo] = useState<Record<string, RemoteInfo>>({});
  const key = packs.map((p) => `${p.id}@${p.version}`).join("|");
  useEffect(() => {
    if (packs.length === 0) return;
    let cancelled = false;
    const known: any[] = [];
    const ask: string[] = [];
    for (const p of packs) {
      const hit = browseThemeList.items.find((f) => p.id === f.id || p.id === f.name);
      if (hit) known.push(hit);
      else ask.push(p.id);
    }
    const finish = (remote: any[]) => {
      if (cancelled) return;
      const result: Record<string, RemoteInfo> = {};
      for (const p of packs) {
        const r = remote.find((x) => x.id === p.id || x.name === p.id);
        result[p.id] = !r
          ? { status: "local" }
          : { status: r.version === p.version ? "installed" : "outdated", remote: r };
      }
      setInfo(result);
    };
    if (ask.length === 0) finish(known);
    else
      Promise.resolve(genericGET(`/themes/ids?ids=${ask.join(".")}`))
        .then((data: any) => finish([...known, ...(Array.isArray(data) ? data : [])]))
        .catch(() => finish(known));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return info;
}

const chip = (color: string): CSSProperties => ({
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.4px",
  textTransform: "uppercase",
  padding: "2px 6px",
  borderRadius: "4px",
  background: color,
  color: "#fff",
  whiteSpace: "nowrap",
});

const ActionButton: VFC<{
  label: string;
  onClick: () => void;
  onHint: (text: string) => void;
  children: ReactNode;
  danger?: boolean;
  active?: boolean;
}> = ({ label, onClick, onHint, children, danger, active }) => (
  <DialogButton
    // The name of the button is shown on the card while it is selected
    aria-label={label}
    onClick={onClick}
    onGamepadFocus={() => onHint(label)}
    onGamepadBlur={() => onHint("")}
    {...({ onMouseEnter: () => onHint(label), onMouseLeave: () => onHint("") } as any)}
    style={{
      minWidth: 0,
      width: "auto",
      flex: "1 1 0",
      padding: "6px 0",
      fontSize: "14px",
      color: danger ? "#ff9b9b" : active ? ACCENT : undefined,
    }}
  >
    {children}
  </DialogButton>
);

const PackCard: VFC<{
  pack: Pack | null; // null: Steam's default sounds
  remote?: RemoteInfo;
  apiUrl: string;
  playing: boolean;
  inUse: boolean;
  favorite: boolean;
  blocked: boolean;
  plays: number;
  onPlayOrUse: () => void;
  onFavorite: () => void;
  onBlock: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
  onInfo: () => void;
}> = (props) => {
  const { pack, remote, apiUrl } = props;
  const [hint, setHint] = useState("");
  const music = !!pack?.music;
  const image = remote?.remote?.images?.[0]?.id;
  const hasImage = !!image && image !== "MISSING";
  const name = pack ? pack.name : "Steam Default Sounds";
  const outdated = remote?.status === "outdated";

  return (
    <div
      style={{
        width: "212px",
        borderRadius: "10px",
        overflow: "hidden",
        background: "linear-gradient(160deg, rgba(58, 30, 88, 0.75), rgba(20, 20, 44, 0.85))",
        border:
          props.playing || props.inUse
            ? `1px solid ${ACCENT}`
            : "1px solid rgba(190, 140, 255, 0.2)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: "112px",
          position: "relative",
          backgroundColor: "#21323d",
          backgroundImage: hasImage
            ? `url(${apiUrl}/blobs/${image})`
            : music
              ? "linear-gradient(135deg, #5a3a8a, #1e1e3a)"
              : "linear-gradient(135deg, #2f5a8a, #1a2a3a)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!hasImage && (
          <span style={{ fontSize: "40px", opacity: 0.6 }}>
            {music ? <FaMusic /> : <FaVolumeUp />}
          </span>
        )}
        <div style={{ position: "absolute", top: "6px", left: "6px", display: "flex", gap: "4px" }}>
          <span style={chip(music ? "rgba(120, 70, 190, 0.9)" : "rgba(40, 110, 180, 0.9)")}>
            {music ? "Music" : "Sounds"}
          </span>
          {props.favorite && <span style={chip("rgba(200, 150, 30, 0.9)")}>★</span>}
          {props.blocked && <span style={chip("rgba(150, 60, 60, 0.9)")}>Never pick</span>}
        </div>
        <div
          style={{ position: "absolute", top: "6px", right: "6px", display: "flex", gap: "4px" }}
        >
          {props.playing && <span style={chip("rgba(40, 150, 90, 0.95)")}>Playing</span>}
          {props.inUse && <span style={chip("rgba(40, 150, 90, 0.95)")}>In use</span>}
          {outdated && <span style={chip("rgba(35, 94, 207, 0.95)")}>Update</span>}
        </div>
      </div>
      <div style={{ padding: "8px 10px 4px", minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: "14px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: "11px",
            opacity: 0.7,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {pack
            ? `${pack.author || "Unknown author"} · ${pack.version || "-"}`
            : "Steam's own sounds"}
        </div>
        <div style={{ fontSize: "11px", opacity: 0.7, minHeight: "15px" }}>
          {hint !== "" ? (
            <span style={{ color: ACCENT, opacity: 1 }}>{hint}</span>
          ) : music ? (
            `Played ${props.plays}×${remote?.status === "local" ? " · local pack" : ""}`
          ) : pack ? (
            remote?.status === "local" ? (
              "Local pack"
            ) : (
              ""
            )
          ) : (
            ""
          )}
        </div>
      </div>
      {/* @ts-ignore */}
      <Focusable
        flow-children="row"
        style={{ display: "flex", gap: "4px", padding: "4px 8px 8px" }}
      >
        <ActionButton
          onHint={setHint}
          label={music ? "Play now" : "Use these sounds"}
          onClick={props.onPlayOrUse}
          active={props.playing || props.inUse}
        >
          {music ? <FaPlay /> : <FaCheck />}
        </ActionButton>
        {music && (
          <>
            <ActionButton
              onHint={setHint}
              label={props.favorite ? "Remove favorite" : "Favorite (plays more often)"}
              onClick={props.onFavorite}
              active={props.favorite}
            >
              {props.favorite ? <FaStar /> : <FaRegStar />}
            </ActionButton>
            <ActionButton
              onHint={setHint}
              label={props.blocked ? "Allow random picks again" : "Never pick automatically"}
              onClick={props.onBlock}
              active={props.blocked}
            >
              <FaBan />
            </ActionButton>
          </>
        )}
        {outdated && (
          <ActionButton
            onHint={setHint}
            label={`Update to ${remote?.remote?.version}`}
            onClick={props.onUpdate}
          >
            <FaSyncAlt />
          </ActionButton>
        )}
        {pack && (
          <>
            <ActionButton onHint={setHint} label="Details" onClick={props.onInfo}>
              <FaInfoCircle />
            </ActionButton>
            <ActionButton onHint={setHint} label="Uninstall" onClick={props.onUninstall} danger>
              <FaTrash />
            </ActionButton>
          </>
        )}
      </Focusable>
    </div>
  );
};

const Segment: VFC<{ label: string; active: boolean; onClick: () => void }> = ({
  label,
  active,
  onClick,
}) => (
  <DialogButton
    onClick={onClick}
    style={{
      minWidth: 0,
      width: "auto",
      padding: "6px 14px",
      background: active
        ? "linear-gradient(145deg, rgba(120, 70, 190, 0.85), rgba(60, 40, 110, 0.9))"
        : undefined,
      color: active ? "#fff" : undefined,
    }}
  >
    {label}
  </DialogButton>
);

export const MyPacksPage: VFC = () => {
  const g = useGlobalState();
  const settings = useSettings();
  const { soundPacks, selectedMusic, activeSound, apiUrl, isInstalling } = g;
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const installed = useMemo(() => soundPacks.filter((p) => !p.steam), [soundPacks]);
  const steamCount = soundPacks.length - installed.length;
  const remote = useRemoteInfo(installed);
  const plays = (p: Pack) => settings.play_counts[p.name] || 0;

  const shown = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    const list = installed.filter(
      (p) =>
        (filter === "all" || (filter === "music") === p.music) &&
        words.every((w) => `${p.name} ${p.author}`.toLowerCase().includes(w))
    );
    const byName = (a: Pack, b: Pack) => a.name.localeCompare(b.name);
    if (sort === "name") return list.sort(byName);
    // Sound packs have no plays: they come after the music
    const n = (p: Pack) => (p.music ? plays(p) : sort === "most" ? -1 : Infinity);
    return list.sort((a, b) => (sort === "most" ? n(b) - n(a) : n(a) - n(b)) || byName(a, b));
  }, [installed, filter, sort, search, settings.play_counts]);

  const toggleIn = (list: string[], name: string, on: boolean) =>
    on ? Array.from(new Set([...list, name])) : list.filter((n) => n !== name);
  const musicCount = installed.filter((p) => p.music).length;
  const outdatedCount = installed.filter((p) => remote[p.id]?.status === "outdated").length;

  const uninstall = (p: Pack) =>
    showModal(
      <ConfirmModal
        strTitle={`Uninstall ${p.name}?`}
        strDescription="The pack's files are deleted. You can install it again from Browse."
        strOKButtonText="Uninstall"
        onOK={() => {
          setBusy(true);
          // Do not leave a deleted pack playing or in use
          if (p.music && p.name === selectedMusic) {
            changeMenuMusic(
              "None",
              g.menuMusic,
              (k: string, v: any) => g.setGlobalState(k, v),
              g.gamesRunning,
              soundPacks,
              g.musicVolume
            );
            python.setConfig({ selected_music: "None" });
          }
          if (!p.music && p.name === activeSound) useSoundPack(g, DEFAULT_SOUNDS);
          python.resolve(python.deletePack(p.name), () => {
            python.reloadBackend().finally(() => setBusy(false));
          });
        }}
      />
    );

  const update = (p: Pack) => {
    const r = remote[p.id]?.remote;
    if (!r?.id) return;
    setBusy(true);
    python.resolve(python.downloadThemeFromUrl(r.id), () => {
      python.reloadBackend().finally(() => setBusy(false));
    });
  };

  const info = (p: Pack) => {
    const r = remote[p.id]?.remote;
    if (r) {
      g.setGlobalState("currentExpandedTheme", r);
      Router.Navigate("/pack-manager-expanded-view");
      return;
    }
    showModal(
      <ConfirmModal
        bAlertDialog
        strTitle={p.name}
        strOKButtonText="Close"
        strDescription={
          <div style={{ fontSize: "13px", lineHeight: 1.5 }}>
            <div>{p.description || "No description."}</div>
            <div style={{ marginTop: "8px", opacity: 0.75 }}>
              {p.music ? "Music pack" : "Sound pack"} · {p.author || "Unknown author"} ·{" "}
              {p.version || "-"}
              {p.music ? ` · played ${plays(p)}×${p.hasIntro ? " · has an intro" : ""}` : ""}
            </div>
            <div
              style={{ opacity: 0.6, fontSize: "11px", marginTop: "4px", overflowWrap: "anywhere" }}
            >
              {p.packPath}
            </div>
            <div style={{ opacity: 0.6, fontSize: "11px", marginTop: "4px" }}>
              Not on the pack website (installed by hand).
            </div>
          </div>
        }
      />
    );
  };

  const card = (p: Pack | null) => {
    const name = p ? p.name : DEFAULT_SOUNDS;
    return (
      <PackCard
        key={p ? p.id + p.name : "default-sounds"}
        pack={p}
        remote={p ? remote[p.id] : undefined}
        apiUrl={apiUrl}
        playing={!!p?.music && p.name === selectedMusic}
        inUse={!p?.music && activeSound === name}
        favorite={!!p && settings.favorite_music.includes(p.name)}
        blocked={!!p && settings.blocked_music.includes(p.name)}
        plays={p ? plays(p) : 0}
        onPlayOrUse={() => (p?.music ? playMusicByHand(g, p.name) : useSoundPack(g, name))}
        onFavorite={() => {
          if (!p) return;
          const on = !settings.favorite_music.includes(p.name);
          updateSetting("favorite_music", toggleIn(settings.favorite_music, p.name, on));
          if (on) updateSetting("blocked_music", toggleIn(settings.blocked_music, p.name, false));
        }}
        onBlock={() => {
          if (!p) return;
          const on = !settings.blocked_music.includes(p.name);
          updateSetting("blocked_music", toggleIn(settings.blocked_music, p.name, on));
          if (on) updateSetting("favorite_music", toggleIn(settings.favorite_music, p.name, false));
        }}
        onUpdate={() => p && update(p)}
        onUninstall={() => p && uninstall(p)}
        onInfo={() => p && info(p)}
      />
    );
  };

  const showDefaultCard = filter !== "music" && search.trim() === "";

  const section = (title: string, list: Pack[], visible: boolean, withDefault: boolean) => {
    if (!visible || (list.length === 0 && !withDefault)) return null;
    return (
      <div style={{ marginBottom: "18px" }}>
        <div
          style={{
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "1px",
            textTransform: "uppercase",
            color: ACCENT,
            borderBottom: "1px solid rgba(190, 140, 255, 0.28)",
            paddingBottom: "4px",
            marginBottom: "10px",
          }}
        >
          {title} ({list.length})
        </div>
        <Focusable style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {withDefault && card(null)}
          {list.map((p) => card(p))}
        </Focusable>
      </div>
    );
  };

  return (
    <div style={{ padding: "0 2.8vw 2em" }}>
      {/* @ts-ignore */}
      <Focusable
        flow-children="row"
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
          margin: "10px 0",
        }}
      >
        <Segment
          label={`All (${installed.length})`}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <Segment
          label={`Music (${musicCount})`}
          active={filter === "music"}
          onClick={() => setFilter("music")}
        />
        <Segment
          label={`Sounds (${installed.length - musicCount})`}
          active={filter === "sounds"}
          onClick={() => setFilter("sounds")}
        />
        <Segment
          label={`Sort: ${SORT_LABELS[sort]}`}
          active={false}
          onClick={() => setSort(NEXT_SORT[sort])}
        />
        <div style={{ flex: "1 1 200px", minWidth: "180px" }}>
          <TextField
            value={search}
            placeholder="Search name or author"
            onChange={(e: any) => setSearch(e.target.value)}
          />
        </div>
      </Focusable>
      <div style={{ fontSize: "12px", opacity: 0.7, marginBottom: "10px" }}>
        {busy || isInstalling ? "Working..." : ""}
        {!busy && !isInstalling && outdatedCount > 0
          ? `${outdatedCount} update${outdatedCount === 1 ? "" : "s"} available. `
          : ""}
        {steamCount > 0
          ? `${steamCount} Steam soundtrack track${steamCount === 1 ? " is" : "s are"} in the Steam Music tab of the menu. `
          : ""}
        Favorites play more often in Smart Shuffle; "Never pick" packs are only played when you
        choose them.
      </div>
      {installed.length === 0 ? (
        <div style={{ opacity: 0.8 }}>No packs installed yet. Find some in the Browse tab.</div>
      ) : (
        <>
          {section("Music", shown.filter((p) => p.music), filter !== "sounds", false)}
          {section("Sounds", shown.filter((p) => !p.music), filter !== "music", showDefaultCard)}
          {shown.length === 0 && !showDefaultCard && <div style={{ opacity: 0.8 }}>Nothing matches.</div>}
        </>
      )}
    </div>
  );
};
