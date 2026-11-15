import { Focusable, Navigation } from "decky-frontend-lib";
import { FaMusic, FaVolumeUp } from "react-icons/fa";
import { FocusButton } from "../menu/parts";
import { cardPicture, chip, CHIP, MUSIC_PLACEHOLDER_BG, smallButton, SOUNDS_PLACEHOLDER_BG } from "../components/look";
import { useEffect, useState, VFC } from "react";
import { ImSpinner5 } from "react-icons/im";
import { BsStar, BsStarFill } from "react-icons/bs";
import { FiDownload } from "react-icons/fi";

import * as python from "../python";
import { genericGET, refreshToken, toggleStar as apiToggleStar } from "../api";

import { useGlobalState } from "../state";
import { FullCSSThemeInfo, PartialCSSThemeInfo } from "../apiTypes";
import { Pack } from "../classes";

export const ExpandedViewPage: VFC = () => {
  const {
    soundPacks: installedThemes,
    currentExpandedTheme,
    isInstalling,
    apiUrl,
    apiFullToken,
    setGlobalState,
  } = useGlobalState();

  const [fullThemeData, setFullData] = useState<FullCSSThemeInfo>();
  const [loaded, setLoaded] = useState<boolean>(false);
  const [isStarred, setStarred] = useState<boolean>(false);
  const [blurStarButton, setBlurStar] = useState<boolean>(false);
  const [imageUrl, setImageUrl] = useState<string>(
    `https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Steam_Deck_logo_%28blue_background%29.svg/2048px-Steam_Deck_logo_%28blue_background%29.svg.png`
  );
  async function getStarredStatus() {
    if (fullThemeData) {
      genericGET(`/users/me/stars/${fullThemeData.id}`, true).then((data) => {
        if (data.starred) {
          setStarred(data.starred);
        }
        if (data.starred && fullThemeData?.starCount === 0) {
          setFullData({
            ...fullThemeData,
            starCount: 1,
          });
        }
      });
    }
  }

  async function toggleStar() {
    if (apiFullToken) {
      setBlurStar(true);
      const newToken = await refreshToken();
      if (fullThemeData && newToken) {
        apiToggleStar(fullThemeData.id, isStarred, newToken, apiUrl).then(
          (bool) => {
            if (bool) {
              setFullData({
                ...fullThemeData,
                starCount: isStarred
                  ? fullThemeData.starCount === 0
                    ? // This stops it from going below 0
                      fullThemeData.starCount
                    : fullThemeData.starCount - 1
                  : fullThemeData.starCount + 1,
              });
              setStarred((cur) => !cur);
              setBlurStar(false);
            }
          }
        );
      }
    } else {
      python.toast("Not Logged In!", "You can only star themes if logged in.");
    }
  }

  console.log("console.log(Navigation)", Navigation);

  function installTheme() {
    setGlobalState("isInstalling", true);
    python.resolve(
      python.downloadThemeFromUrl(fullThemeData?.id || "ERROR"),
      () => {
        python.reloadBackend().then(() => {
          setGlobalState("isInstalling", false);
        });
      }
    );
  }

  function checkIfThemeInstalled(themeObj: PartialCSSThemeInfo) {
    const filteredArr: Pack[] = installedThemes.filter(
      (e: Pack) =>
        e.name === themeObj.name && e.author === themeObj.specifiedAuthor
    );
    if (filteredArr.length > 0) {
      if (filteredArr[0].version === themeObj.version) {
        return "installed";
      } else {
        return "outdated";
      }
    } else {
      return "uninstalled";
    }
  }
  // These are just switch statements I use to determine text/css for the buttons
  // I put them up here just because I find it clearer to read when they aren't inline
  function calcButtonText(installStatus: string) {
    let buttonText = "";
    switch (installStatus) {
      case "installed":
        buttonText = "Installed";
        break;
      case "outdated":
        buttonText = "Update";
        break;
      default:
        buttonText = "Install";
        break;
    }
    return buttonText;
  }

  useEffect(() => {
    if (currentExpandedTheme?.id) {
      setLoaded(false);
      genericGET(`/themes/${currentExpandedTheme.id}`).then((data) => {
        setFullData(data);
        if (data?.images[0]?.id && data.images[0].id !== "MISSING") {
          setImageUrl(`${apiUrl}/blobs/${data?.images[0].id}`);
        } else {
          setImageUrl(
            `https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Steam_Deck_logo_%28blue_background%29.svg/2048px-Steam_Deck_logo_%28blue_background%29.svg.png`
          );
        }
        setLoaded(true);
      });
    }
  }, [currentExpandedTheme]);

  useEffect(() => {
    if (apiFullToken && fullThemeData) {
      getStarredStatus();
    }
  }, [apiFullToken, fullThemeData]);

  if (!loaded) {
    return (
      <>
        <style>
          {`
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
            .spinny {
              animation: spin 1s linear infinite;
            }
          `}
        </style>
        <div
          style={{
            marginTop: "40px",
            display: "flex",
            gap: "1em",
            alignItems: "center",
            justifyContent: "center",
            flex: "1",
          }}
        >
          <ImSpinner5 className="spinny" size={48} />
          <span style={{ fontWeight: "bold", fontSize: "2.5em" }}>Loading</span>
        </div>
      </>
    );
  }

  // if theres no theme in the detailed view
  if (fullThemeData) {
    // This returns 'installed', 'outdated', or 'uninstalled'
    const installStatus = checkIfThemeInstalled(fullThemeData);
    const music = fullThemeData.target === "Music";
    const statusChip =
      installStatus === "installed" ? (
        <span style={chip(CHIP.good)}>Installed</span>
      ) : installStatus === "outdated" ? (
        <span style={chip(CHIP.update)}>Update available</span>
      ) : null;
    return (
      // The outermost div is to push the content down into the visible area
      <div style={{ marginTop: "40px", padding: "16px 2.8vw 2em" }}>
        <style>
          {`
            @keyframes spin { to { transform: rotate(360deg); } }
            .spinny { animation: spin 1s linear infinite; display: inline-flex; }
          `}
        </style>
        <div style={{ display: "flex", gap: "20px", alignItems: "flex-start" }}>
          <div
            style={{
              ...cardPicture(imageUrl && !imageUrl.includes("Steam_Deck_logo") ? imageUrl : "", music ? MUSIC_PLACEHOLDER_BG : SOUNDS_PLACEHOLDER_BG),
              width: "400px",
              height: "225px",
              borderRadius: "10px",
              border: "1px solid rgba(190, 140, 255, 0.25)",
              flex: "0 0 auto",
            }}
          >
            {(!imageUrl || imageUrl.includes("Steam_Deck_logo")) && (
              <span style={{ fontSize: "64px", opacity: 0.6 }}>{music ? <FaMusic /> : <FaVolumeUp />}</span>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: "6px", marginBottom: "6px" }}>
              <span style={chip(music ? CHIP.music : CHIP.sounds)}>{fullThemeData.target}</span>
              {statusChip}
            </div>
            <div style={{ fontWeight: 800, fontSize: "1.6em", lineHeight: 1.2, overflowWrap: "anywhere" }}>{fullThemeData.name}</div>
            <div style={{ opacity: 0.8, marginTop: "2px" }}>
              {fullThemeData.specifiedAuthor} · {fullThemeData.version}
            </div>
            <div style={{ display: "flex", gap: "14px", fontSize: "13px", opacity: 0.8, margin: "8px 0 14px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <BsStarFill style={{ color: "#ffd166" }} /> {fullThemeData.starCount}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <FiDownload /> {fullThemeData.download.downloadCount}
              </span>
            </div>
            <Focusable style={{ display: "flex", flexDirection: "column", gap: "8px", maxWidth: "320px" }}>
              <FocusButton
                style={{ ...smallButton(installStatus !== "installed"), height: "40px", fontSize: "14px" }}
                disabled={installStatus === "installed" || isInstalling}
                onClick={() => installTheme()}
              >
                {isInstalling ? (
                  <>
                    <span className="spinny">
                      <FiDownload />
                    </span>
                    Installing...
                  </>
                ) : (
                  calcButtonText(installStatus)
                )}
              </FocusButton>
              {!!apiFullToken && (
                <FocusButton style={{ ...smallButton(isStarred), height: "40px" }} disabled={blurStarButton} onClick={toggleStar}>
                  {isStarred ? <BsStarFill /> : <BsStar />}
                  {isStarred ? "Starred" : "Star"} ({fullThemeData.starCount})
                </FocusButton>
              )}
              <div>
                <FocusButton
                  style={{ ...smallButton(), height: "40px", width: "100%" }}
                  onClick={() => {
                    setGlobalState("currentExpandedTheme", undefined);
                    setFullData(undefined);
                    setLoaded(false);
                    Navigation.NavigateBack();
                  }}
                >
                  Back
                </FocusButton>
              </div>
            </Focusable>
          </div>
        </div>
        <div
          style={{
            marginTop: "18px",
            padding: "14px 16px",
            borderRadius: "10px",
            background: "linear-gradient(160deg, rgba(58, 30, 88, 0.55), rgba(20, 20, 44, 0.65))",
            border: "1px solid rgba(190, 140, 255, 0.2)",
            lineHeight: 1.55,
            whiteSpace: "pre-wrap",
          }}
        >
          {fullThemeData?.description || <i style={{ opacity: 0.6 }}>No description provided.</i>}
        </div>
      </div>
    );
  }
  return (
    <>
      <div
        style={{
          marginTop: "40px",
          display: "flex",
          gap: "1em",
          alignItems: "center",
          justifyContent: "center",
          flex: "1",
        }}
      >
        <span>Error fetching selected theme, please go back and retry.</span>
      </div>
    </>
  );
};
