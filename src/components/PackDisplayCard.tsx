import { FC, useState } from "react";
import { Focusable, Router } from "decky-frontend-lib";
import { FaMusic, FaStar, FaVolumeUp } from "react-icons/fa";
import { useGlobalState } from "../state/GlobalState";
import { Pack } from "../classes";
import { PartialCSSThemeInfo, ThemeQueryRequest } from "../apiTypes";
import { ACCENT, card, cardLine, cardPicture, cardTitle, chip, CHIP, MUSIC_PLACEHOLDER_BG, SOUNDS_PLACEHOLDER_BG } from "./look";

// A pack on the Browse page (the pack website), in the same style as the My Packs cards.
// Selecting it opens its detail page.

export const PackDisplayCard: FC<{
  data: PartialCSSThemeInfo;
  refPassthrough?: any;
  searchOpts: ThemeQueryRequest;
  prevSearchOptsVarName: string;
}> = ({ data: e, refPassthrough = undefined, searchOpts, prevSearchOptsVarName }) => {
  const { soundPacks, apiUrl, setGlobalState } = useGlobalState();
  const [focused, setFocused] = useState(false);

  const installed: Pack | undefined = soundPacks.find((p: Pack) => p.name === e.name && p.author === e.specifiedAuthor);
  const status = !installed ? "" : installed.version === e.version ? "installed" : "outdated";
  const image = e?.images?.[0]?.id && e.images[0].id !== "MISSING" ? `${apiUrl}/blobs/${e.images[0].id}` : "";
  const music = e.target === "Music";

  return (
    <Focusable
      ref={refPassthrough}
      onActivate={() => {
        setGlobalState(prevSearchOptsVarName, searchOpts);
        setGlobalState("currentExpandedTheme", e);
        Router.Navigate("/pack-manager-expanded-view");
      }}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      {...({ onMouseEnter: () => setFocused(true), onMouseLeave: () => setFocused(false) } as any)}
      noFocusRing
      style={{
        ...card(!!installed),
        transition: "all 0.12s ease",
        ...(focused
          ? {
              boxShadow: "0 0 0 2px rgba(201, 160, 255, 0.9), 0 0 12px rgba(201, 160, 255, 0.7)",
              transform: "scale(1.03)",
              filter: "brightness(1.15)",
            }
          : {}),
      }}
    >
      <div style={cardPicture(image, music ? MUSIC_PLACEHOLDER_BG : SOUNDS_PLACEHOLDER_BG)}>
        {!image && <span style={{ fontSize: "40px", opacity: 0.6 }}>{music ? <FaMusic /> : <FaVolumeUp />}</span>}
        <div style={{ position: "absolute", top: "6px", left: "6px", display: "flex", gap: "4px" }}>
          <span style={chip(music ? CHIP.music : CHIP.sounds)}>{e.target || "Sounds"}</span>
        </div>
        <div style={{ position: "absolute", top: "6px", right: "6px", display: "flex", gap: "4px" }}>
          {status === "installed" && <span style={chip(CHIP.good)}>Installed</span>}
          {status === "outdated" && <span style={chip(CHIP.update)}>Update</span>}
        </div>
        {e.starCount > 0 && (
          <div style={{ position: "absolute", bottom: "6px", right: "6px" }}>
            <span style={chip(CHIP.dark)}>
              <FaStar style={{ color: "#ffd166" }} /> {e.starCount}
            </span>
          </div>
        )}
      </div>
      <div style={{ padding: "8px 10px 10px", minWidth: 0 }}>
        <div style={cardTitle}>{e.name}</div>
        <div style={cardLine}>
          {e.specifiedAuthor || "Unknown author"} · {e.version}
        </div>
        <div style={{ ...cardLine, color: focused ? ACCENT : undefined, opacity: focused ? 1 : 0.7 }}>
          {focused ? "Select for details" : status === "installed" ? "In My Packs" : status === "outdated" ? "A newer version is here" : " "}
        </div>
      </div>
    </Focusable>
  );
};
