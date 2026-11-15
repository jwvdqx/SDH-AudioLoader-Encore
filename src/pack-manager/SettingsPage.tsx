import { Focusable, TextField } from "decky-frontend-lib";
import { useState, VFC } from "react";
import { EncoreButton } from "../menu/parts";
import { logInWithShortToken, logOut } from "../api";
import { useGlobalState } from "../state";
import { StoragePanel } from "./StoragePanel";

// Settings of the Pack Manager: storage first, then the optional pack website account (only used to
// star packs in Browse), then the credits.

const heading = { fontWeight: 700, fontSize: "1.4em", margin: "18px 0 6px" } as const;
const small = { fontSize: "12px", opacity: 0.75, lineHeight: 1.5 } as const;

export const SettingsPage: VFC = () => {
  const { apiShortToken, apiFullToken, apiMeData } = useGlobalState();
  const [token, setToken] = useState<string>(apiShortToken);

  return (
    <div style={{ padding: "0 2.8vw 2em" }}>
      <StoragePanel />

      <div style={heading}>Pack Website Account (optional)</div>
      <div style={small}>
        Only needed to star packs on deckthemes.com from the Browse page. Create an account there and generate a deck token on
        your account page.
      </div>
      <Focusable style={{ display: "flex", gap: "10px", alignItems: "center", marginTop: "8px" }}>
        {apiFullToken ? (
          <>
            <div style={{ flex: 1 }}>{apiMeData ? `Logged in as ${apiMeData.username}` : "Loading..."}</div>
            <EncoreButton style={{ width: "auto", minWidth: "160px" }} onClick={logOut}>
              Unlink My Deck
            </EncoreButton>
          </>
        ) : (
          <>
            <div style={{ flex: 1 }}>
              <TextField label="DeckThemes Account Key" bIsPassword value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
            <EncoreButton
              style={{ width: "auto", minWidth: "160px" }}
              disabled={token.length !== 12}
              onClick={() => logInWithShortToken(token)}
            >
              Log In
            </EncoreButton>
          </>
        )}
      </Focusable>

      <div style={heading}>About</div>
      <div style={small}>
        Audio Loader Encore, an unofficial fork of Audio Loader by SuchMeme (github.com/suchmememanyskill), EMERALD
        (github.com/EMERALD0874) and Beebles (github.com/beebls). Encore changes by jwvdqx. Pack creation guide:
        docs.deckthemes.com. Packs are from deckthemes.com.
      </div>
    </div>
  );
};
