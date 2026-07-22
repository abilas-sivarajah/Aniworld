"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PRESET_PROXY_REGIONS } from "@/lib/proxy-types";
import type {
  AppConfig,
  Media,
  MediaLanguage,
  SearchResultItem,
  Series,
  VideoDetails,
  VideoStream,
} from "@/lib/types";

// Minimal shape of the fatal error payload hls.js emits on Hls.Events.ERROR.
interface HlsFatalError {
  fatal?: boolean;
  type?: string;
  details?: string;
  response?: { code?: number; text?: string };
  networkDetails?: { status?: number };
}

const DEFAULT_CONFIG: AppConfig = {
  hostUrl: "https://aniworld.to/",
  site: "anime",
  ignoreCertificateValidation: false,
  passwordHashSHA256: "",
  useProxy: false,
  proxyRegion: "none",
  proxyUrl: "",
};

const ANIME_SUGGESTIONS = [
  "Solo Leveling",
  "One Piece",
  "Demon Slayer",
  "Attack on Titan",
  "Jujutsu Kaisen",
  "My Dress-Up Darling",
  "Naruto Shippuden",
];

const SERIES_SUGGESTIONS = [
  "Breaking Bad",
  "Game of Thrones",
  "Stranger Things",
  "The Walking Dead",
  "House of the Dragon",
  "Prison Break",
  "Suits",
];

function stripHtmlTags(str: string): string {
  if (!str) return "";
  return str.replace(/<[^>]*>/g, "").replace(/&#\d+;/g, (match) => {
    const code = parseInt(match.replace(/[&#;]/g, ""), 10);
    return String.fromCharCode(code);
  });
}

async function sha256Hex(str: string): Promise<string> {
  if (!str) return "";
  const buffer = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function languageLabel(lang: MediaLanguage | null | undefined): string {
  if (!lang) return "Unbekannt";
  const audio = lang.audio || "Unbekannt";
  return lang.subtitle ? `${audio} (${lang.subtitle})` : audio;
}

export default function Home() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [authState, setAuthState] = useState<"checking" | "gate" | "ok">(
    "checking",
  );

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [dropdown, setDropdown] = useState<SearchResultItem[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(
    null,
  );

  const [series, setSeries] = useState<Series | null>(null);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [activeTab, setActiveTab] = useState<number | "movies">(1);
  const [episodes, setEpisodes] = useState<Media[]>([]);
  const [episodesLabel, setEpisodesLabel] = useState("Episoden");
  const [episodesStatus, setEpisodesStatus] = useState("");
  const [isMovieTab, setIsMovieTab] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [videoModal, setVideoModal] = useState<{
    episode: Media;
    isMovie: boolean;
  } | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoDetails, setVideoDetails] = useState<VideoDetails | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [extractedUrl, setExtractedUrl] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- Config & auth ----

  const checkAuthStatus = useCallback(async (cfg: AppConfig) => {
    try {
      const res = await fetch("/api/auth/status");
      const data = await res.json();
      if (data.isProtected) {
        const savedToken = sessionStorage.getItem("ss_auth_token");
        if (savedToken) {
          const verify = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hash: savedToken }),
          });
          if (verify.ok) {
            setAuthState("ok");
            return;
          }
        }
        setAuthState("gate");
      } else {
        setAuthState("ok");
      }
    } catch {
      setAuthState("ok");
    }
    void cfg;
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const data: AppConfig = await res.json();
        setConfig(data);
        return data;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  useEffect(() => {
    (async () => {
      const cfg = await fetchConfig();
      await checkAuthStatus(cfg ?? DEFAULT_CONFIG);
    })();
  }, [fetchConfig, checkAuthStatus]);

  // ---- Live search dropdown ----

  const runLiveSearch = useCallback(async (query: string) => {
    try {
      const res = await fetch(`/api/search?keyword=${encodeURIComponent(query)}`);
      if (!res.ok) {
        setDropdownOpen(false);
        return;
      }
      const results: SearchResultItem[] = await res.json();
      if (results && results.length > 0) {
        setDropdown(results.slice(0, 6));
        setDropdownOpen(true);
      } else {
        setDropdownOpen(false);
      }
    } catch {
      setDropdownOpen(false);
    }
  }, []);

  const onSearchInput = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setDropdownOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => runLiveSearch(value.trim()), 250);
  };

  // ---- Series / episodes ----

  const loadSeason = useCallback(
    async (title: string, seasonNum: number) => {
      setCurrentSeason(seasonNum);
      setIsMovieTab(false);
      setEpisodesLabel(`Staffel ${seasonNum}`);
      setEpisodesStatus("Lade Episoden...");
      setEpisodes([]);
      try {
        const res = await fetch(
          `/api/episodes?title=${encodeURIComponent(title)}&season=${seasonNum}`,
        );
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Episoden konnten nicht geladen werden.");
        setEpisodes(data as Media[]);
        setEpisodesStatus("");
      } catch (err) {
        setEpisodesStatus(
          err instanceof Error ? err.message : "Fehler beim Laden",
        );
      }
    },
    [],
  );

  const loadMovies = useCallback(async (title: string) => {
    setIsMovieTab(true);
    setEpisodesLabel("Filme");
    setEpisodesStatus("Lade Filme...");
    setEpisodes([]);
    try {
      const res = await fetch(`/api/movies?title=${encodeURIComponent(title)}`);
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Filme konnten nicht geladen werden.");
      setEpisodes(data as Media[]);
      setEpisodesStatus("");
    } catch (err) {
      setEpisodesStatus(err instanceof Error ? err.message : "Fehler beim Laden");
    }
  }, []);

  const searchSeries = useCallback(
    async (title: string) => {
      setError(null);
      setSearchResults(null);
      setSeries(null);
      setDropdownOpen(false);
      setLoading(`Suche nach "${title}" auf ${config.hostUrl}...`);
      try {
        const res = await fetch(`/api/series?title=${encodeURIComponent(title)}`);
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Serie konnte nicht gefunden werden.");
        const found = data as Series;
        setSeries(found);
        setActiveTab(1);
        await loadSeason(found.title, 1);
        await fetchConfig();
        setLoading(null);
      } catch (err) {
        setLoading(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [config.hostUrl, loadSeason, fetchConfig],
  );

  const performQuery = useCallback(
    async (query: string) => {
      setDropdownOpen(false);
      setSearchQuery(query);
      setSeries(null);
      setEpisodes([]);
      setSearchResults(null);
      if (!query.trim()) return;

      setLoading(`Suche nach "${query}"...`);
      try {
        const res = await fetch(`/api/search?keyword=${encodeURIComponent(query)}`);
        if (res.ok) {
          const results: SearchResultItem[] = await res.json();
          if (results && results.length > 1) {
            setLoading(null);
            setSearchResults(results);
            return;
          }
          if (results && results.length === 1) {
            const clean = stripHtmlTags(results[0].title);
            setSearchQuery(clean);
            await searchSeries(clean);
            return;
          }
        }
      } catch {
        /* fall through */
      }
      await searchSeries(query);
    },
    [searchSeries],
  );

  const onSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await performQuery(searchQuery.trim());
  };

  // ---- Settings ----

  const saveConfig = useCallback(async (next: AppConfig) => {
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const data: AppConfig = await res.json();
        setConfig(data);
        return data;
      }
    } catch {
      setError("Fehler beim Speichern der Einstellungen.");
    }
    return null;
  }, []);

  // ---- Video modal & stream extraction ----

  const openVideoModal = useCallback(
    async (episode: Media, isMovie: boolean) => {
      setVideoModal({ episode, isMovie });
      setVideoDetails(null);
      setVideoError(null);
      setExtractedUrl(null);
      setIframeUrl(null);
      setVideoLoading(true);
      try {
        const url = `/api/video-info?title=${encodeURIComponent(
          series!.title,
        )}&season=${currentSeason}&episode=${episode.number}&isMovie=${isMovie}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok)
          throw new Error(
            data.error || "Stream-Details konnten nicht abgerufen werden.",
          );
        setVideoDetails(data as VideoDetails);
      } catch (err) {
        setVideoError(err instanceof Error ? err.message : String(err));
      } finally {
        setVideoLoading(false);
      }
    },
    [series, currentSeason],
  );

  const closeVideoModal = useCallback(() => {
    setVideoModal(null);
    setIframeUrl(null);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }
  }, []);

  const playStream = useCallback(async (url: string) => {
    setIframeUrl(null);
    setExtractedUrl(url); // keep the real url for display / "URL kopieren"
    setPlayerError(null);
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    // Wait for the <video> element to mount.
    await new Promise((r) => setTimeout(r, 0));
    const video = videoRef.current;
    if (!video) return;

    // Play through the backend proxy: the hoster CDN blocks the browser via
    // CORS / Referer and the signed token was minted for the backend, so a
    // direct load fails. The proxy re-fetches server-side and adds CORS headers.
    const playbackUrl = `/api/hls-proxy?url=${encodeURIComponent(url)}`;

    video.onerror = () => {
      const code = video.error?.code;
      setPlayerError(
        `Player-Fehler (video.error code ${code ?? "?"}). ` +
          "Der Stream ließ sich nicht abspielen.",
      );
    };

    if (url.includes(".m3u8")) {
      const Hls = (await import("hls.js")).default;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(playbackUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => undefined);
        });
        // Surface fatal errors on screen instead of a silent black player,
        // so we can see whether the proxy returns 403 / 502 / 504 etc.
        hls.on(Hls.Events.ERROR, (_evt: unknown, data: HlsFatalError) => {
          if (!data?.fatal) return;
          const status = data.response?.code ?? data.networkDetails?.status;
          setPlayerError(
            `HLS-Fehler: ${data.type} / ${data.details}` +
              (status ? ` (HTTP ${status})` : "") +
              ". Prüfe /api/hls-proxy im Network-Tab.",
          );
        });
        hlsRef.current = hls;
        return;
      }
      // Safari / iOS: native HLS via the proxied url.
      video.src = playbackUrl;
      video.play().catch(() => undefined);
      return;
    }
    // Plain video file (mp4 etc.) — also proxied for CORS / Referer / range.
    video.src = playbackUrl;
    video.play().catch(() => undefined);
  }, []);

  // "Im Player öffnen": prefer the clean extraction → proxy player (same,
  // proven, ad-free path as the "Stream-URL" button). Only if extraction is not
  // available for this hoster do we fall back to a sandboxed iframe embed.
  const openInPlayer = useCallback(
    async (stream: VideoStream, setBusy: (b: boolean) => void) => {
      setBusy(true);
      try {
        // 1) Try direct clean HLS extraction first (0-ads, 0-popups).
        try {
          const extractRes = await fetch("/api/extract-stream", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              videoUrl: stream.videoUrl,
              hoster: stream.hoster,
            }),
          });
          const extractData = await extractRes.json();
          if (extractRes.ok && extractData.streamUrl) {
            await playStream(extractData.streamUrl);
            return; // outer finally still resets the busy state
          }
        } catch {
          /* fall through to the iframe fallback */
        }

        // 2) Extraction unavailable → sandboxed iframe embed (blocks popups).
        try {
          const res = await fetch(
            `/api/resolve?url=${encodeURIComponent(stream.videoUrl)}`,
          );
          const data = await res.json();
          const embedUrl: string = data.embedUrl || stream.videoUrl;
          setExtractedUrl(null);
          if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
          }
          setIframeUrl(embedUrl);
        } catch {
          setExtractedUrl(null);
          setIframeUrl(stream.videoUrl);
        }
      } finally {
        setBusy(false);
      }
    },
    [playStream],
  );

  const extractStream = useCallback(
    async (stream: VideoStream, setBusy: (b: boolean) => void) => {
      setBusy(true);
      try {
        const res = await fetch("/api/extract-stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            videoUrl: stream.videoUrl,
            hoster: stream.hoster,
          }),
        });
        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Fehler beim Extrahieren des Streams.");
        await playStream(data.streamUrl);
      } catch (err) {
        alert(
          `Stream konnte nicht extrahiert werden: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        setBusy(false);
      }
    },
    [playStream],
  );

  useEffect(() => {
    const originalOpen = window.open;
    window.open = function (url) {
      console.warn("[AdBlock Shield] Pop-up blockiert:", url);
      return null;
    };
    return () => {
      window.open = originalOpen;
    };
  }, []);

  const showLogout = authState === "ok" && Boolean(config.passwordHashSHA256);

  return (
    <>
      <header className="navbar">
        <div className="nav-container">
          <div className="brand">
            <i className="fa-solid fa-play-circle brand-icon"></i>
            <span className="brand-name">
              Stream<span className="highlight">Hub</span>
            </span>
            <span className="badge site-badge">{config.site}</span>
          </div>

          <div className="nav-actions">
            <span className="adblock-badge" title="Automatischer Popup- & Werbeblocker ist aktiv">
              <i className="fa-solid fa-shield-halved"></i> AdBlock Aktiv
            </span>
            <div
              className="url-indicator"
              title="Klicke hier, um die Website-URL zu ändern"
              onClick={() => setSettingsOpen(true)}
            >
              <i className="fa-solid fa-globe"></i>
              <span>{config.hostUrl}</span>
            </div>
            {showLogout && (
              <button
                className="btn btn-outline small"
                title="App sperren"
                onClick={() => {
                  sessionStorage.removeItem("ss_auth_token");
                  setAuthState("gate");
                }}
              >
                <i className="fa-solid fa-lock"></i> Sperren
              </button>
            )}
            <button
              className="btn btn-icon"
              title="Einstellungen"
              onClick={() => setSettingsOpen(true)}
            >
              <i className="fa-solid fa-gear"></i>
            </button>
          </div>
        </div>
      </header>

      <main className="app-container">
        <section className="hero-section">
          <div className="hero-content">
            <h1 className="hero-title">Finde deine Lieblingsserien & Animes</h1>
            <p className="hero-subtitle">
              Nutze die SerienStream / AniWorld API zum Suchen, Durchsuchen von
              Staffeln und Streamen.
            </p>

            <form className="search-form" onSubmit={onSearchSubmit}>
              <div className="search-box">
                <i className="fa-solid fa-magnifying-glass search-icon"></i>
                <input
                  type="text"
                  placeholder="Serien- oder Animename eingeben (z.B. One Piece, Solo Leveling)..."
                  autoComplete="off"
                  value={searchQuery}
                  onChange={(e) => onSearchInput(e.target.value)}
                  onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                  required
                />
                <button type="submit" className="btn btn-primary">
                  Suchen
                </button>
                {dropdownOpen && dropdown.length > 0 && (
                  <div className="search-dropdown">
                    {dropdown.map((item, i) => (
                      <div
                        key={i}
                        className="search-dropdown-item"
                        onMouseDown={() => {
                          setDropdownOpen(false);
                          setSearchResults(null);
                          setSearchQuery(item.title);
                          searchSeries(item.title);
                        }}
                      >
                        <div className="search-dropdown-title">{item.title}</div>
                        {item.description && (
                          <div className="search-dropdown-desc">
                            {item.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </form>

            <div className="quick-tags">
              <span className="tag-label">Vorschläge:</span>
              {(config.site === "anime" || (config.hostUrl && config.hostUrl.includes("aniworld"))
                ? ANIME_SUGGESTIONS
                : SERIES_SUGGESTIONS
              ).map((title) => (
                <button
                  key={title}
                  className="quick-chip"
                  onClick={() => performQuery(title)}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>
        </section>

        {searchResults && (
          <section className="search-results-section">
            <div className="episodes-header">
              <h3>Suchergebnisse</h3>
              <span className="episodes-count">
                {searchResults.length} Treffer
              </span>
              <button
                className="btn btn-icon"
                onClick={() => setSearchResults(null)}
                title="Schließen"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="search-results-grid">
              {searchResults.map((item, i) => (
                <div
                  key={i}
                  className="search-result-card"
                  onClick={() => {
                    setSearchResults(null);
                    setSearchQuery(item.title);
                    searchSeries(item.title);
                  }}
                >
                  <div>
                    <div className="search-result-title">{item.title}</div>
                    {item.description && (
                      <div className="search-result-desc">
                        {item.description}
                      </div>
                    )}
                  </div>
                  <div className="search-result-action">
                    <span>Öffnen</span>{" "}
                    <i className="fa-solid fa-arrow-right"></i>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>{loading}</p>
          </div>
        )}

        {error && (
          <div className="error-banner">
            <i className="fa-solid fa-circle-exclamation"></i>
            <div>
              <strong>{error}</strong>
              <div
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.85rem",
                  opacity: 0.9,
                }}
              >
                💡 <strong>Hilfe &amp; Tipps zur Behebung:</strong>
                <br />• <strong>Richtige Host-URL?</strong> Prüfe in den
                Einstellungen (⚙️ oben rechts), ob deine gewünschte Domain
                eingetragen ist.
                <br />• <strong>Website-Typ wählen:</strong> Bei Animes wähle{" "}
                <code>anime</code> (AniWorld/AniCloud), bei Serien wähle{" "}
                <code>serie</code> (SerienStream).
                <br />• <strong>Exakter Titel:</strong> Gib den Namen wie auf der
                Webseite ein (z.B. <em>My Dress-Up Darling</em>,{" "}
                <em>One Piece</em>).
              </div>
            </div>
          </div>
        )}

        {series && (
          <section className="series-card">
            <div
              className="banner-backdrop"
              style={{
                backgroundImage: series.bannerUrl
                  ? `url('${series.bannerUrl}')`
                  : "none",
              }}
            ></div>

            <div className="series-content">
              <div className="series-header">
                <div className="series-title-group">
                  <h2 className="series-title">{series.title}</h2>
                  <div className="series-meta-bar">
                    <span className="meta-item">
                      <i className="fa-regular fa-calendar"></i>{" "}
                      {series.yearStart}
                      {series.yearEnd ? ` - ${series.yearEnd}` : ""}
                    </span>
                    <span className="meta-item">
                      <i className="fa-solid fa-shield"></i> FSK{" "}
                      {series.ageRating ?? "k.A."}
                    </span>
                    <span className="meta-item">
                      <i className="fa-solid fa-star"></i>{" "}
                      {(series.ratingsCount || 0).toLocaleString("de-DE")}{" "}
                      Bewertungen
                    </span>
                    {series.imdbUrl && (
                      <a
                        href={series.imdbUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="imdb-link"
                      >
                        <i className="fa-brands fa-imdb"></i> IMDb
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="genre-list">
                {(series.genres || []).map((g) => (
                  <span key={g} className="genre-tag">
                    {g}
                  </span>
                ))}
              </div>

              <p className="series-description">
                {series.description || "Keine Beschreibung verfügbar."}
              </p>

              <div className="cast-info">
                {series.directors?.length > 0 && (
                  <div className="cast-row">
                    <strong>Regie:</strong>{" "}
                    <span>{series.directors.join(", ")}</span>
                  </div>
                )}
                {series.actors?.length > 0 && (
                  <div className="cast-row">
                    <strong>Besetzung:</strong>{" "}
                    <span>{series.actors.join(", ")}</span>
                  </div>
                )}
                {series.creators?.length > 0 && (
                  <div className="cast-row">
                    <strong>Produktion:</strong>{" "}
                    <span>{series.creators.join(", ")}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="season-section">
              <div className="season-tabs-wrapper">
                <div className="season-tabs">
                {Array.from(
                  { length: series.seasonsCount },
                  (_, i) => i + 1,
                ).map((s) => (
                  <button
                    key={s}
                    className={`season-tab ${activeTab === s ? "active" : ""}`}
                    onClick={() => {
                      setActiveTab(s);
                      loadSeason(series.title, s);
                    }}
                  >
                    Staffel {s}
                  </button>
                ))}
                {series.hasMovies && (
                  <button
                    className={`season-tab ${activeTab === "movies" ? "active" : ""}`}
                    onClick={() => {
                      setActiveTab("movies");
                      loadMovies(series.title);
                    }}
                  >
                    Filme
                  </button>
                )}
              </div>
            </div>

              <div className="episodes-container">
                <div className="episodes-header">
                  <h3>{episodesLabel}</h3>
                  <span className="episodes-count">
                    {episodesStatus ||
                      `${episodes.length} ${isMovieTab ? "Filme" : "Episoden"}`}
                  </span>
                </div>

                <div className="episodes-grid">
                  {episodesStatus && episodes.length === 0 ? (
                    <p className="text-muted">{episodesStatus}</p>
                  ) : (
                    episodes.map((ep) => (
                      <div
                        key={ep.number}
                        className="episode-card"
                        onClick={() => openVideoModal(ep, isMovieTab)}
                      >
                        <div className="episode-header-row">
                          <span className="episode-number-badge">
                            {isMovieTab ? "Film" : `Episode ${ep.number}`}
                          </span>
                        </div>
                        <div>
                          <div className="episode-card-title">
                            {ep.title || `Episode ${ep.number}`}
                          </div>
                          {ep.originalTitle && (
                            <div className="episode-card-subtitle">
                              {ep.originalTitle}
                            </div>
                          )}
                        </div>
                        <div className="episode-tags">
                          {(ep.languages || []).map((l, i) => (
                            <span key={`l${i}`} className="lang-chip">
                              {languageLabel(l)}
                            </span>
                          ))}
                          {(ep.hosters || []).map((h, i) => (
                            <span key={`h${i}`} className="hoster-chip">
                              {h}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {videoModal && (
        <VideoModal
          episode={videoModal.episode}
          isMovie={videoModal.isMovie}
          season={currentSeason}
          loading={videoLoading}
          details={videoDetails}
          error={videoError}
          extractedUrl={extractedUrl}
          iframeUrl={iframeUrl}
          playerError={playerError}
          copied={copied}
          videoRef={videoRef}
          onClose={closeVideoModal}
          onExtract={extractStream}
          onOpenInPlayer={openInPlayer}
          onCopy={() => {
            if (extractedUrl) {
              navigator.clipboard.writeText(extractedUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }
          }}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          config={config}
          onClose={() => setSettingsOpen(false)}
          onSave={async (next) => {
            const saved = await saveConfig(next);
            setSettingsOpen(false);
            await checkAuthStatus(saved ?? config);
            if (series) searchSeries(series.title);
          }}
        />
      )}

      {authState === "gate" && (
        <LoginGate
          onSuccess={() => setAuthState("ok")}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function VideoModal({
  episode,
  isMovie,
  season,
  loading,
  details,
  error,
  extractedUrl,
  iframeUrl,
  playerError,
  copied,
  videoRef,
  onClose,
  onExtract,
  onOpenInPlayer,
  onCopy,
}: {
  episode: Media;
  isMovie: boolean;
  season: number;
  loading: boolean;
  details: VideoDetails | null;
  error: string | null;
  extractedUrl: string | null;
  iframeUrl: string | null;
  playerError: string | null;
  copied: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClose: () => void;
  onExtract: (stream: VideoStream, setBusy: (b: boolean) => void) => void;
  onOpenInPlayer: (stream: VideoStream, setBusy: (b: boolean) => void) => void;
  onCopy: () => void;
}) {
  const playerBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if ((iframeUrl || extractedUrl) && playerBoxRef.current) {
      setTimeout(() => {
        playerBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [iframeUrl, extractedUrl]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">
              {episode.title ||
                (isMovie ? `Film ${episode.number}` : `Episode ${episode.number}`)}
            </h3>
            <p className="modal-subtitle">
              {isMovie ? "Film" : `Staffel ${season}, Episode ${episode.number}`}
            </p>
          </div>
          <button className="btn btn-icon close-modal" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Lade Video-Streams &amp; Hoster...</p>
            </div>
          ) : (
            <div>
              <p className="episode-description">
                {details?.description ||
                  "Keine Episodenbeschreibung verfügbar."}
              </p>

              <h4 className="streams-heading">
                <i className="fa-solid fa-server"></i> Verfügbare Hoster &amp;
                Streams
              </h4>
              <div className="streams-list">
                {error ? (
                  <div className="error-banner">
                    <i className="fa-solid fa-circle-exclamation"></i> {error}
                  </div>
                ) : !details?.streams || details.streams.length === 0 ? (
                  <p className="text-muted">
                    Keine Streams für diese Episode gefunden.
                  </p>
                ) : (
                  details.streams.map((st, i) => (
                    <StreamItem
                      key={i}
                      stream={st}
                      onExtract={onExtract}
                      onOpenInPlayer={onOpenInPlayer}
                    />
                  ))
                )}
              </div>

              {iframeUrl && (
                <div className="extracted-stream-box" ref={playerBoxRef}>
                  <div className="stream-box-header">
                    <span className="stream-box-title">
                      <i className="fa-solid fa-tv"></i> Direkt-Player (Hoster)
                    </span>
                    <a
                      className="btn btn-sm btn-secondary"
                      href={iframeUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <i className="fa-solid fa-up-right-from-square"></i> Im
                      neuen Tab
                    </a>
                  </div>
                  <div className="player-container">
                    {/*
                      Sandbox WITHOUT allow-popups / allow-top-navigation:
                      this is the only in-page mechanism that actually blocks
                      the hoster's pop-up ads and forced redirects, while
                      allow-scripts/allow-same-origin keep the video player
                      itself working. If a hoster refuses to play under this,
                      the user falls back to the "Im neuen Tab" link.
                    */}
                    <iframe
                      src={iframeUrl}
                      sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
                      allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                      allowFullScreen
                      referrerPolicy="no-referrer"
                      style={{
                        width: "100%",
                        aspectRatio: "16 / 9",
                        border: 0,
                        borderRadius: "var(--radius-sm)",
                        background: "#000",
                      }}
                    ></iframe>
                  </div>
                  <p
                    className="form-help"
                    style={{ marginTop: "0.5rem" }}
                  >
                    Läuft direkt vom Hoster zu dir (nicht über Vercel). Falls es
                    schwarz bleibt oder Werbung kommt: „Im neuen Tab" öffnen.
                  </p>
                </div>
              )}

              {extractedUrl && (
                <div className="extracted-stream-box" ref={playerBoxRef}>
                  <div className="stream-box-header">
                    <span className="stream-box-title">
                      <i className="fa-solid fa-bolt"></i> Direkt-Stream
                      Extrahiert
                    </span>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={onCopy}
                    >
                      {copied ? (
                        <>
                          <i className="fa-solid fa-check"></i> Kopiert!
                        </>
                      ) : (
                        <>
                          <i className="fa-regular fa-copy"></i> URL Kopieren
                        </>
                      )}
                    </button>
                  </div>
                  <div className="player-container">
                    <video
                      ref={videoRef}
                      controls
                      playsInline
                      className="video-player"
                    ></video>
                  </div>
                  {playerError && (
                    <div
                      className="form-help"
                      style={{
                        marginTop: "0.5rem",
                        color: "#ff6b6b",
                        wordBreak: "break-word",
                      }}
                    >
                      <i className="fa-solid fa-triangle-exclamation"></i>{" "}
                      {playerError}
                    </div>
                  )}
                  <div className="stream-url-display">{extractedUrl}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StreamItem({
  stream,
  onExtract,
  onOpenInPlayer,
}: {
  stream: VideoStream;
  onExtract: (stream: VideoStream, setBusy: (b: boolean) => void) => void;
  onOpenInPlayer: (stream: VideoStream, setBusy: (b: boolean) => void) => void;
}) {
  const [busyPlay, setBusyPlay] = useState(false);
  const [busyExtract, setBusyExtract] = useState(false);
  return (
    <div className="stream-item">
      <div className="stream-info">
        <span className="hoster-name">{stream.hoster || "Hoster"}</span>
        <span className="stream-lang-badge">
          <i className="fa-solid fa-volume-high"></i>{" "}
          {languageLabel(stream.language)}
        </span>
      </div>
      <div className="stream-actions">
        <button
          className="btn btn-sm btn-primary"
          disabled={busyPlay}
          onClick={() => onOpenInPlayer(stream, setBusyPlay)}
        >
          {busyPlay ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin"></i> Öffne...
            </>
          ) : (
            <>
              <i className="fa-solid fa-play"></i> Im Player öffnen
            </>
          )}
        </button>
        <button
          className="btn btn-sm btn-secondary"
          disabled={busyExtract}
          title="Direkte Stream-URL extrahieren (z.B. für VLC)"
          onClick={() => onExtract(stream, setBusyExtract)}
        >
          {busyExtract ? (
            <>
              <i className="fa-solid fa-circle-notch fa-spin"></i> Extrahiere...
            </>
          ) : (
            <>
              <i className="fa-solid fa-link"></i> Stream-URL
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function SettingsModal({
  config,
  onClose,
  onSave,
}: {
  config: AppConfig;
  onClose: () => void;
  onSave: (next: AppConfig) => void;
}) {
  const [hostUrl, setHostUrl] = useState(config.hostUrl);
  const [site, setSite] = useState(config.site);
  const [ignoreCert, setIgnoreCert] = useState(
    config.ignoreCertificateValidation,
  );
  const [passwordHash, setPasswordHash] = useState(config.passwordHashSHA256);
  const [useProxy, setUseProxy] = useState(config.useProxy ?? false);
  const [proxyRegion, setProxyRegion] = useState(config.proxyRegion ?? "none");
  const [proxyUrl, setProxyUrl] = useState(config.proxyUrl ?? "");
  const [addQuickBtn, setAddQuickBtn] = useState(false);

  const [customPresets, setCustomPresets] = useState<
    Array<{ url: string; site: string; label: string }>
  >(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem("saved_quick_presets") || "[]");
    } catch {
      return [];
    }
  });

  const saveCustomPresets = (
    list: Array<{ url: string; site: string; label: string }>,
  ) => {
    setCustomPresets(list);
    localStorage.setItem("saved_quick_presets", JSON.stringify(list));
  };

  const removeCustomPreset = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = [...customPresets];
    updated.splice(index, 1);
    saveCustomPresets(updated);
  };

  const applyPreset = (targetUrl: string, targetSite: string) => {
    setHostUrl(targetUrl);
    if (targetSite) setSite(targetSite);
  };

  const generateHash = async () => {
    const pwd = prompt(
      "Bitte gib das Passwort ein, das in einen SHA-256 Hash umgewandelt werden soll:",
    );
    if (pwd) {
      const hash = await sha256Hex(pwd);
      setPasswordHash(hash);
      alert(
        `Passwort erfolgreich umgewandelt!\n\nPasswort: ${pwd}\nSHA-256 Hash:\n${hash}\n\nKlicke jetzt unten auf 'Einstellungen Speichern'.`,
      );
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card settings-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            <i className="fa-solid fa-sliders"></i> API &amp; Website
            Einstellungen
          </h3>
          <button className="btn btn-icon close-modal" onClick={onClose}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const trimmedUrl = hostUrl.trim();
            if (addQuickBtn && trimmedUrl) {
              if (!customPresets.some((p) => p.url === trimmedUrl)) {
                const domainName = trimmedUrl
                  .replace(/^https?:\/\//, "")
                  .replace(/\/$/, "");
                saveCustomPresets([
                  ...customPresets,
                  { url: trimmedUrl, site, label: domainName },
                ]);
              }
            }
            onSave({
              hostUrl: trimmedUrl,
              site,
              ignoreCertificateValidation: ignoreCert,
              passwordHashSHA256: passwordHash.trim(),
              useProxy,
              proxyRegion,
              proxyUrl: proxyUrl.trim(),
            });
          }}
        >
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="hostUrlInput">
                Website Base-URL (SerienStream / AniWorld / Spiegel)
              </label>
              <input
                id="hostUrlInput"
                type="url"
                placeholder="https://aniworld.to/ oder https://serienstream.to/"
                value={hostUrl}
                onChange={(e) => setHostUrl(e.target.value)}
                required
              />

              <div className="url-preset-bar">
                <label className="checkbox-label save-preset-checkbox">
                  <input
                    type="checkbox"
                    checked={addQuickBtn}
                    onChange={(e) => setAddQuickBtn(e.target.checked)}
                  />
                  <span>
                    <i className="fa-solid fa-plus-circle"></i> Diese URL als Schnell-Button hinzufügen
                  </span>
                </label>
                <div className="preset-buttons-wrapper">
                  <button
                    type="button"
                    className={`btn-preset-chip ${hostUrl === "https://aniworld.to/" ? "active" : ""}`}
                    onClick={() => applyPreset("https://aniworld.to/", "anime")}
                    title="Zu AniWorld (https://aniworld.to/) wechseln"
                  >
                    <i className="fa-solid fa-dragon"></i> AniWorld
                  </button>
                  <button
                    type="button"
                    className={`btn-preset-chip ${hostUrl === "https://serienstream.to/" ? "active" : ""}`}
                    onClick={() => applyPreset("https://serienstream.to/", "serie")}
                    title="Zu SerienStream.to (https://serienstream.to/) wechseln"
                  >
                    <i className="fa-solid fa-tv"></i> SerienStream.to
                  </button>
                  <button
                    type="button"
                    className={`btn-preset-chip ${hostUrl === "https://burning-series.io/" ? "active" : ""}`}
                    onClick={() => applyPreset("https://burning-series.io/", "bs")}
                    title="Zu Burning Series (https://burning-series.io/) wechseln"
                  >
                    <i className="fa-solid fa-fire"></i> Burning Series
                  </button>

                  {customPresets.map((p, idx) => (
                    <button
                      key={p.url + idx}
                      type="button"
                      className={`btn-preset-chip ${hostUrl === p.url ? "active" : ""}`}
                      onClick={() => applyPreset(p.url, p.site)}
                      title={`Zu ${p.label || p.url} wechseln`}
                    >
                      <i className="fa-solid fa-bookmark"></i> {p.label}
                      <i
                        className="fa-solid fa-xmark btn-preset-remove"
                        onClick={(e) => removeCustomPreset(idx, e)}
                        title="Diesen Schnell-Button löschen"
                      ></i>
                    </button>
                  ))}
                </div>
              </div>

              <small className="form-help">
                Du kannst hier deine bevorzugte Domain eintragen oder auf einen Schnell-Button klicken.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="siteSelect">Website Typ</label>
              <select
                id="siteSelect"
                value={site}
                onChange={(e) => setSite(e.target.value)}
              >
                <option value="serie">SerienStream (serie)</option>
                <option value="anime">AniWorld / AniCloud (anime)</option>
                <option value="bs">Burning Series (bs.to / burning-series.io)</option>
              </select>
            </div>

            <div className="form-group checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={ignoreCert}
                  onChange={(e) => setIgnoreCert(e.target.checked)}
                />
                <span>
                  SSL Zertifikatsprüfung ignorieren (für inoffizielle /
                  unsichere Host-URLs)
                </span>
              </label>
            </div>

            {/* VPN / Ausländisches Proxy-Routing */}
            <div style={{ margin: "1.25rem 0", padding: "1rem", background: "rgba(255,255,255,0.03)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
              <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.95rem", color: "var(--accent-cyan)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <i className="fa-solid fa-globe"></i> Ausländischer VPN &amp; Proxy Server
              </h4>
              
              <div className="form-group checkbox-group" style={{ marginBottom: "0.75rem" }}>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={useProxy}
                    onChange={(e) => setUseProxy(e.target.checked)}
                  />
                  <span>Ausländisches Routing / VPN aktivieren (für HLS-Proxy &amp; Stream-Scraper)</span>
                </label>
              </div>

              {useProxy && (
                <>
                  <div className="form-group">
                    <label htmlFor="proxyRegionSelect">Standort / Ausländischer Server-Knoten</label>
                    <select
                      id="proxyRegionSelect"
                      value={proxyRegion}
                      onChange={(e) => setProxyRegion(e.target.value)}
                    >
                      {PRESET_PROXY_REGIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.flag} {r.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(proxyRegion === "custom" || proxyUrl.length > 0) && (
                    <div className="form-group" style={{ marginTop: "0.75rem" }}>
                      <label htmlFor="proxyUrlInput">Proxy URL (HTTP/HTTPS oder SOCKS5)</label>
                      <input
                        id="proxyUrlInput"
                        type="text"
                        placeholder="http://user:pass@us-proxy.com:8080 oder socks5://127.0.0.1:1080"
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                      />
                      <small className="form-help">
                        Format: http://[user:pass@]host:port oder socks5://[user:pass@]host:port
                      </small>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="passwordHashInput">
                SHA-256 Passwort-Hash (Zugriffsschutz)
              </label>
              <div className="hash-input-group">
                <input
                  id="passwordHashInput"
                  type="text"
                  placeholder="Passwort-Hash in SHA-256 Hex-Format..."
                  value={passwordHash}
                  onChange={(e) => setPasswordHash(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-outline small"
                  onClick={generateHash}
                >
                  <i className="fa-solid fa-key"></i> Hash Generator
                </button>
              </div>
              <small className="form-help">
                Wenn dieses Feld leer ist, ist kein Passwortschutz aktiv. Du
                kannst hier deinen SHA-256 Hash eintragen.
              </small>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary">
              Einstellungen Speichern
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setErrorMsg(null);
    try {
      const hash = await sha256Hex(password);
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, hash }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem("ss_auth_token", hash);
        onSuccess();
      } else {
        setErrorMsg(data.error || "Falsches Passwort!");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Verbindungsfehler");
    }
  };

  return (
    <div className="login-overlay">
      <div className="login-card glass-panel">
        <div className="login-header">
          <div className="lock-icon-container">
            <i className="fa-solid fa-shield-halved"></i>
          </div>
          <h2>Geschützter Bereich</h2>
          <p>
            Bitte gib das Passwort ein, um Zugriff auf die WebApp zu erhalten.
          </p>
        </div>

        <form className="login-form" onSubmit={submit}>
          <div className="form-group">
            <label htmlFor="gatePasswordInput">Passwort</label>
            <div className="password-input-wrapper">
              <input
                id="gatePasswordInput"
                type={showPassword ? "text" : "password"}
                placeholder="Passwort eingeben..."
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn-toggle-password"
                onClick={() => setShowPassword((v) => !v)}
                title="Passwort anzeigen/verbergen"
              >
                <i
                  className={
                    showPassword
                      ? "fa-solid fa-eye-slash"
                      : "fa-solid fa-eye"
                  }
                ></i>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="login-error">
              <i className="fa-solid fa-circle-exclamation"></i>{" "}
              <span>{errorMsg}</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block">
            <i className="fa-solid fa-right-to-bracket"></i> Anmelden
          </button>

          <button
            type="button"
            className="btn btn-outline btn-block"
            style={{ marginTop: "0.75rem" }}
            onClick={async () => {
              if (
                !confirm(
                  "Zugriffsschutz wirklich zurücksetzen? Das gespeicherte Passwort wird entfernt.",
                )
              )
                return;
              try {
                await fetch("/api/auth/reset", { method: "POST" });
              } catch {
                /* ignore */
              }
              sessionStorage.removeItem("ss_auth_token");
              window.location.reload();
            }}
          >
            <i className="fa-solid fa-unlock"></i> Passwort vergessen? Zugriff
            zurücksetzen
          </button>
        </form>
      </div>
    </div>
  );
}
