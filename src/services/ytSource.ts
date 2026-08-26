import type { Innertube as InnertubeType } from "youtubei.js";
import * as fs from "fs";
import ytpl from "ytpl";
import ytsearch from "yt-search";
import { mintPoToken } from "./potoken";
import { ResolveResult, TrackInfo } from "./trackTypes";

const URL_RE = /^https?:\/\//i;
const PLAYLIST_ONLY_RE = /[?&]list=([^&]+)/;
const VIDEO_ID_RE = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/|live\/))([\w-]{11})/;

/**
 * youtubei.js is ESM-only; the project compiles to CommonJS, so it has to be
 * loaded with a dynamic import() rather than a static import.
 */
async function loadInnertube() {
  const { Innertube, ClientType } = await import("youtubei.js");
  return { Innertube, ClientType };
}

let innertube: Promise<InnertubeType> | undefined;

// This session is deliberately anonymous and pinned to the IOS client, which
// deciphers formats without needing YouTube's web player JS at all. A real
// PoToken (see potoken.ts) is attached per-request instead of relying on
// account cookies: merely having a cookie makes youtubei.js sign every
// request with that account's SAPISID hash, and a real, previously
// web-only Google account suddenly presenting as "the iOS app" is exactly
// the kind of client/account mismatch YouTube's anti-abuse system rejects
// with a 400 - a fake/garbage cookie doesn't trigger this since there's no
// real account history to contradict. This is expected to keep shifting as
// YouTube's anti-bot measures evolve.
function getInnertube() {
  if (!innertube) {
    innertube = loadInnertube().then(({ Innertube, ClientType }) =>
      Innertube.create({
        generate_session_locally: true,
        client_type: ClientType.IOS,
      }),
    );
  }
  return innertube;
}

function extractVideoId(url: string): string | undefined {
  return url.match(VIDEO_ID_RE)?.[1];
}

/**
 * Some videos (age-restricted, or otherwise flagged as needing a real signed-
 * in account rather than just proof of a non-bot client) reject the anonymous
 * IOS session outright, PoToken or not. YOUTUBE_COOKIES_FILE/YOUTUBE_COOKIES
 * enables a fallback authenticated session for those - see getFallbackInnertube.
 * The cookie array is usually too large for a plain env var (see
 * docker-compose.yml for the file-based option); either the EditThisCookie-
 * style JSON array or a raw "name=value; name2=value2" Cookie header string
 * is accepted.
 */
function loadCookieHeader(): string | undefined {
  const cookiesPath = process.env.YOUTUBE_COOKIES_FILE;
  const inlineCookies = process.env.YOUTUBE_COOKIES;
  if (!cookiesPath && !inlineCookies) return undefined;

  try {
    const raw = (cookiesPath ? fs.readFileSync(cookiesPath, "utf8") : inlineCookies)!.trim();
    if (!raw) return undefined;
    if (!raw.startsWith("[")) return raw;

    const cookies: { name: string; value: string }[] = JSON.parse(raw);
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch (error) {
    console.error("Failed to load YouTube cookies, continuing without them:", error);
    return undefined;
  }
}

let fallbackInnertube: Promise<InnertubeType> | undefined;

// A signed-in session, used only as a fallback when the anonymous one is
// rejected. Pinned to the MUSIC (YouTube Music / WEB_REMIX) client rather
// than IOS: it's a real web-family Google product a signed-in account
// legitimately authenticates against with browser cookies, unlike IOS, which
// is a different client/account combination YouTube's anti-abuse system
// flags precisely because cookie-bearing sessions never show up as "the iOS
// app" in practice.
function getFallbackInnertube() {
  if (!fallbackInnertube) {
    fallbackInnertube = loadInnertube().then(({ Innertube, ClientType }) =>
      Innertube.create({
        cookie: loadCookieHeader(),
        generate_session_locally: true,
        client_type: ClientType.MUSIC,
      }),
    );
  }
  return fallbackInnertube;
}

async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-0" } });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves a user-provided search term or url into one or more playable tracks.
 * Pure playlist urls (no attached video id) are expanded fully; everything else
 * (video urls or free text) resolves to a single track, the latter via search.
 */
export async function resolve(query: string): Promise<ResolveResult> {
  const isUrl = URL_RE.test(query);

  if (isUrl && PLAYLIST_ONLY_RE.test(query) && !/[?&]v=/.test(query)) {
    const playlist = await ytpl(query, { limit: 100 });
    return {
      isPlaylist: true,
      tracks: playlist.items.map((item) => ({
        source: "youtube",
        url: item.shortUrl,
        title: item.title,
        author: item.author?.name ?? "Unknown",
        durationMs: (item.durationSec ?? 0) * 1000,
        thumbnail: item.bestThumbnail.url ?? undefined,
        isLive: item.isLive,
      })),
    };
  }

  const videoId = isUrl ? extractVideoId(query) : undefined;
  if (isUrl && videoId) {
    return { isPlaylist: false, tracks: [await getTrackInfo(query)] };
  }

  if (isUrl) throw new Error("That url is not a supported YouTube link");

  const results = await ytsearch(query);
  const hit = results.videos[0];
  if (!hit) throw new Error("No results found for that search");

  return {
    isPlaylist: false,
    tracks: [
      {
        source: "youtube",
        url: hit.url,
        title: hit.title,
        author: hit.author.name,
        durationMs: hit.duration.seconds * 1000,
        thumbnail: hit.thumbnail,
        isLive: hit.duration.seconds === 0,
      },
    ],
  };
}

export async function getTrackInfo(url: string): Promise<TrackInfo> {
  const videoId = extractVideoId(url) ?? url;
  const yt = await getInnertube();
  const info = await yt.getBasicInfo(videoId);
  const details = info.basic_info;
  return {
    source: "youtube",
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: details.title ?? "Unknown",
    author: details.author ?? "Unknown",
    durationMs: (details.duration ?? 0) * 1000,
    thumbnail: details.thumbnail?.at(-1)?.url,
    isLive: details.is_live ?? false,
  };
}

/**
 * Fetches a fresh direct-stream url for a track. Signed urls expire, so this
 * is re-resolved every time a track (re)starts playback rather than cached.
 *
 * A PoToken is attached whenever one can be minted (see potoken.ts) since some
 * videos otherwise 403 on the actual byte fetch even though metadata resolved
 * fine. If that still isn't enough - some videos need a real signed-in
 * account, not just proof of a non-bot client - this falls back to an
 * authenticated session (see getFallbackInnertube), if cookies are configured.
 */
export async function getPlayableUrl(url: string): Promise<string> {
  const videoId = extractVideoId(url) ?? url;
  const po_token = await mintPoToken(videoId);

  const yt = await getInnertube();
  const format = await yt.getStreamingData(videoId, { type: "audio", quality: "best", po_token });
  if (format?.url && (await isReachable(format.url))) {
    console.log(`[ytSource] ${videoId}: using the anonymous session's url`);
    return format.url;
  }
  console.log(`[ytSource] ${videoId}: anonymous session's url was rejected`);

  const hasCookies = Boolean(loadCookieHeader());
  console.log(`[ytSource] ${videoId}: cookies configured: ${hasCookies}`);
  if (hasCookies) {
    const ytFallback = await getFallbackInnertube();
    const fallbackFormat = await ytFallback.getStreamingData(videoId, {
      type: "audio",
      quality: "best",
      po_token,
    });
    if (fallbackFormat?.url && (await isReachable(fallbackFormat.url))) {
      console.log(`[ytSource] ${videoId}: using the authenticated fallback session's url`);
      return fallbackFormat.url;
    }
    console.log(`[ytSource] ${videoId}: authenticated fallback session's url was also rejected`);
  }

  throw new Error("No playable audio stream was found for this track");
}
