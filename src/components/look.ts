import { CSSProperties } from "react";

// Encore's look, in one place: the cards, badges and small buttons of the Pack Manager pages
// (My Packs, Find Music, Browse) and the menu all use these, so they stay the same everywhere.

export const ACCENT = "#c9a0ff";
export const ACTIVE_BG = "linear-gradient(145deg, rgba(120, 70, 190, 0.85), rgba(60, 40, 110, 0.9))";
export const MUSIC_PLACEHOLDER_BG = "linear-gradient(135deg, #5a3a8a, #1e1e3a)";
export const SOUNDS_PLACEHOLDER_BG = "linear-gradient(135deg, #2f5a8a, #1a2a3a)";

/** A pack or song card. highlighted: playing, in use. */
export const card = (highlighted = false): CSSProperties => ({
  width: "212px",
  borderRadius: "10px",
  overflow: "hidden",
  background: "linear-gradient(160deg, rgba(58, 30, 88, 0.75), rgba(20, 20, 44, 0.85))",
  border: highlighted ? `1px solid ${ACCENT}` : "1px solid rgba(190, 140, 255, 0.2)",
  display: "flex",
  flexDirection: "column",
});

/** The picture area at the top of a card. */
export const cardPicture = (image: string, fallback: string): CSSProperties => ({
  height: "112px",
  position: "relative",
  flex: "0 0 auto",
  backgroundColor: "#21323d",
  backgroundImage: image ? `url("${image}")` : fallback,
  backgroundSize: "cover",
  backgroundPosition: "center",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

/** A small badge on a card picture. */
export const chip = (bg: string): CSSProperties => ({
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.4px",
  textTransform: "uppercase",
  padding: "2px 6px",
  borderRadius: "4px",
  background: bg,
  color: "#fff",
  whiteSpace: "nowrap",
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
});

export const CHIP = {
  music: "rgba(120, 70, 190, 0.9)",
  sounds: "rgba(40, 110, 180, 0.9)",
  good: "rgba(40, 150, 90, 0.95)",
  muted: "rgba(110, 110, 130, 0.95)",
  bad: "rgba(150, 60, 60, 0.95)",
  update: "rgba(35, 94, 207, 0.95)",
  favorite: "rgba(200, 150, 30, 0.9)",
  warn: "rgba(200, 120, 30, 0.95)",
  site: "rgba(255, 85, 0, 0.9)",
  dark: "rgba(0, 0, 0, 0.7)",
};

/** A small button on a card or in a toolbar (used with FocusButton, which adds the highlight). */
export const smallButton = (active = false): CSSProperties => ({
  minWidth: 0,
  width: "auto",
  height: "32px",
  padding: "0 10px",
  fontSize: "13px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  borderRadius: "6px",
  border: active ? "1px solid rgba(200, 160, 255, 0.8)" : "1px solid rgba(120, 100, 170, 0.3)",
  background: active ? ACTIVE_BG : "rgba(40, 32, 70, 0.75)",
  color: active ? "#fff" : "#d9ccef",
});

export const cardTitle: CSSProperties = { fontWeight: 700, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
export const cardLine: CSSProperties = { fontSize: "11px", opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
export const pagePadding: CSSProperties = { padding: "10px 2.8vw 2em" };
