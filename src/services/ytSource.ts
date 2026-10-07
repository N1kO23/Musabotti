import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PassThrough, Readable } from "stream";
import ytsearch from "yt-search";
import { ResolveResult, TrackInfo } from "./trackTypes";

/**
 * YouTube extraction goes through yt-dlp (a spawned binary, see Dockerfile)
 * rather than a JS library. youtubei.js (which this used to be built on) kept
 * failing to actually stream a real, non-restricted-looking video even with a
 * signed-in account and a valid PoToken - yt-dlp's extraction is far more
 * mature and battle-tested against YouTube's anti-bot measures, and succeeds
 * on the exact videos that approach couldn't.
 */
// Read on use rather than at import, which happens before .env is loaded.
// || rather than ?? so the empty YTDLP_PATH= from .env.example falls back too.
const ytDlpBin = () => process.env.YTDLP_PATH || "yt-dlp";

const RETRY_DELAY_MS = 1000;

const URL_RE = /^https?:\/\//i;
const PLAYLIST_ONLY_RE = /[?&]list=([^&]+)/;

interface YtDlpEntry {
  id: string;
  title: string;
  channel?: string;
  uploader?: string;
  duration?: number;
  is_live?: boolean;
  webpage_url?: string;
  url?: string;
  thumbnail?: string;
  thumbnails?: { url: string }[];
}

// Passed to every yt-dlp run. YouTube extraction without a JS runtime is
// deprecated in yt-dlp (formats go missing) and only deno is enabled by
// default - Node is always available wherever the bot itself runs.
const BASE_ARGS = ["--js-runtimes", `node:${process.execPath}`];

// Kills a hung metadata lookup; /play stops waiting on it well before this
const RESOLVE_PROCESS_TIMEOUT_MS = 30_000;

function exitError(code: number | null, stderr: string) {
  const lastLines = stderr.trim().split("\n").slice(-3).join(" | ");
  const reason = code === null ? "was killed" : `exited with code ${code}`;
  return new Error(`yt-dlp ${reason}${lastLines ? `: ${lastLines}` : ""}`);
}

function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(ytDlpBin(), [...BASE_ARGS, ...args], {
      timeout: RESOLVE_PROCESS_TIMEOUT_MS,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(exitError(code, stderr));
      }
    });
  });
}

/**
 * Runs yt-dlp with cookies attached (if configured), retrying once without
 * them if that fails. Stale/expired/invalid cookies (yt-dlp's "The page needs
 * to be reloaded" is the classic symptom) would otherwise take down every
 * video, including the many that don't need an authenticated session at all.
 */
async function runYtDlpResilient(baseArgs: string[]): Promise<string> {
  const cookies = cookieArgs();
  if (cookies.length === 0) return runYtDlp(baseArgs);

  try {
    return await runYtDlp([...cookies, ...baseArgs]);
  } catch (error) {
    console.error("yt-dlp failed with cookies attached, retrying without them:", error);
    return runYtDlp(baseArgs);
  }
}

interface RawCookie {
  domain?: string;
  path?: string;
  secure?: boolean;
  expirationDate?: number;
  name: string;
  value: string;
}

// A tab or newline inside a field would corrupt the tab-separated format
const sanitize = (value: string) => value.replace(/[\t\r\n]/g, "");

function toNetscapeCookieFile(cookies: RawCookie[]): string {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const cookie of cookies) {
    if (!cookie?.name || cookie.value === undefined || cookie.value === null) continue;

    const domain = cookie.domain?.startsWith(".") ? cookie.domain : `.${cookie.domain ?? "youtube.com"}`;
    const expiry = cookie.expirationDate ? Math.floor(cookie.expirationDate) : 0;
    lines.push(
      [
        sanitize(domain),
        "TRUE",
        sanitize(cookie.path ?? "/"),
        cookie.secure ? "TRUE" : "FALSE",
        expiry,
        sanitize(cookie.name),
        sanitize(String(cookie.value)),
      ].join("\t"),
    );
  }
  return `${lines.join("\n")}\n`;
}

let cookiesFilePath: string | null | undefined;

/**
 * yt-dlp needs cookies as a Netscape-format file. YOUTUBE_COOKIES_FILE/
 * YOUTUBE_COOKIES (see .env.example) is either already in that format (e.g.
 * exported via the "Get cookies.txt LOCALLY" extension) and gets used
 * directly, or is the EditThisCookie-style JSON array from before and gets
 * converted into a Netscape file once, cached for the process lifetime.
 */
function loadCookiesFilePath(): string | undefined {
  if (cookiesFilePath !== undefined) return cookiesFilePath ?? undefined;

  const configuredPath = process.env.YOUTUBE_COOKIES_FILE;
  const inline = process.env.YOUTUBE_COOKIES;
  if (!configuredPath && !inline) {
    cookiesFilePath = null;
    return undefined;
  }

  try {
    if (configuredPath && fs.existsSync(configuredPath) && fs.statSync(configuredPath).isDirectory()) {
      // A very common Docker gotcha: bind-mounting a host path that doesn't
      // exist creates an empty directory there instead of erroring, so a
      // typo'd or stale filename silently mounts a directory rather than
      // failing the container to start.
      throw new Error(
        `${configuredPath} is a directory, not a file - check the docker-compose.yml volume mount points at ` +
          "the right filename (a mounted path that doesn't exist on the host becomes an empty directory)",
      );
    }

    const raw = (configuredPath ? fs.readFileSync(configuredPath, "utf8") : inline)!.trim();
    if (!raw) {
      cookiesFilePath = null;
      return undefined;
    }

    if (!raw.startsWith("[")) {
      // Already Netscape format (or close enough) - use the configured file
      // directly if there is one, otherwise write the inline content out.
      if (configuredPath) {
        cookiesFilePath = configuredPath;
      } else {
        const tmpPath = path.join(os.tmpdir(), "musabotti-youtube-cookies.txt");
        fs.writeFileSync(tmpPath, raw);
        cookiesFilePath = tmpPath;
      }
      return cookiesFilePath;
    }

    const cookies: RawCookie[] = JSON.parse(raw);
    const tmpPath = path.join(os.tmpdir(), "musabotti-youtube-cookies.txt");
    fs.writeFileSync(tmpPath, toNetscapeCookieFile(cookies));
    cookiesFilePath = tmpPath;
    return cookiesFilePath;
  } catch (error) {
    console.error("Failed to load YouTube cookies, continuing without them:", error);
    cookiesFilePath = null;
    return undefined;
  }
}

function cookieArgs(): string[] {
  const filePath = loadCookiesFilePath();
  return filePath ? ["--cookies", filePath] : [];
}

/** yt-dlp's -j output: one JSON object per line */
function parseEntries(output: string): YtDlpEntry[] {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function toTrackInfo(entry: YtDlpEntry): TrackInfo {
  return {
    source: "youtube",
    url: entry.webpage_url ?? entry.url ?? `https://www.youtube.com/watch?v=${entry.id}`,
    title: entry.title,
    author: entry.channel ?? entry.uploader ?? "Unknown",
    durationMs: (entry.duration ?? 0) * 1000,
    thumbnail: entry.thumbnail ?? entry.thumbnails?.at(-1)?.url,
    isLive: entry.is_live ?? false,
  };
}

/**
 * Resolves a user-provided search term or url into one or more playable
 * tracks. Pure playlist urls (no attached video id) are expanded (up to 100
 * entries, via yt-dlp's fast --flat-playlist mode - each entry still carries
 * full metadata for YouTube specifically); everything else (video urls or
 * free text) resolves to a single track, the latter via search.
 */
export async function resolve(query: string): Promise<ResolveResult> {
  const isUrl = URL_RE.test(query);
  const isPlaylist = isUrl && PLAYLIST_ONLY_RE.test(query) && !/[?&]v=/.test(query);
  const target = isUrl ? query : `ytsearch1:${query}`;

  const args = [
    "-j",
    "--no-warnings",
    ...(isPlaylist ? ["--flat-playlist", "--playlist-end", "100"] : ["--no-playlist"]),
    target,
  ];

  const entries = parseEntries(await runYtDlpResilient(args));

  if (entries.length === 0) {
    throw new Error(isUrl ? "That url is not a supported YouTube link" : "No results found for that search");
  }

  return { isPlaylist, tracks: entries.map(toTrackInfo) };
}

/**
 * Quick keyword search for /play's autocomplete suggestions, best match
 * first. Uses yt-search's in-process scrape rather than yt-dlp: each yt-dlp
 * search is a ~1.5s process spawn, too slow and heavy to run per keystroke.
 * Resolving and playback still go through yt-dlp.
 */
export async function search(query: string, limit: number): Promise<TrackInfo[]> {
  const results = await ytsearch(query);
  return results.videos.slice(0, limit).map((video) => ({
    source: "youtube",
    url: video.url,
    title: video.title,
    author: video.author.name,
    durationMs: video.duration.seconds * 1000,
    thumbnail: video.thumbnail,
    isLive: video.duration.seconds === 0,
  }));
}

// Version labels Spotify appends (" - 2004 Remaster", " - Mono") that YouTube
// titles don't share. Live recordings and remixes keep theirs, since those
// are different recordings to find.
const VERSION_LABEL_RE =
  /\s+-\s+[^-]*\b(remaster(ed)?|mono|stereo|single version|album version|radio edit)\b.*$/i;
const FEATURING_RE = /\s*[([](feat|ft|with)\.?\s[^)\]]*[)\]]/gi;
// How far a plain YouTube result's length may be from the song's to count as it
const LENGTH_TOLERANCE_S = 3;

/** Letters and digits only, lowercased and without accents, for comparing titles */
const normalizeTitle = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const titlesMatch = (a: string, b: string) => {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  return !x || !y || x.includes(y) || y.includes(x);
};

const watchUrl = (entry: YtDlpEntry) => `https://www.youtube.com/watch?v=${entry.id}`;

/**
 * Finds the YouTube upload of a song known only by its title, artist and
 * length (e.g. from Spotify). YouTube Music's song search comes first: it
 * returns official recordings, and its top result was the right one for
 * every song tried. Its results carry no length, so the title is what gets
 * checked there. Plain YouTube search is the fallback, where the length
 * decides between official uploads, lyric videos and covers.
 */
export async function findSong(
  title: string,
  artist: string,
  durationMs: number,
): Promise<string | undefined> {
  const cleanTitle = title.replace(VERSION_LABEL_RE, "").replace(FEATURING_RE, "").trim();
  const mainArtist = artist.split(",")[0].trim();

  try {
    const query = encodeURIComponent(`${mainArtist} ${cleanTitle}`);
    const songs = parseEntries(
      await runYtDlpResilient([
        "-j",
        "--flat-playlist",
        "--playlist-end",
        "5",
        "--no-warnings",
        `https://music.youtube.com/search?q=${query}#songs`,
      ]),
    );
    const song = songs.find((entry) => titlesMatch(entry.title, cleanTitle));
    if (song) return watchUrl(song);
  } catch (error) {
    console.error(`YouTube Music search failed for "${mainArtist} - ${cleanTitle}", trying YouTube:`, error);
  }

  const videos = parseEntries(
    await runYtDlpResilient([
      "-j",
      "--flat-playlist",
      "--no-warnings",
      `ytsearch5:${mainArtist} - ${cleanTitle}`,
    ]),
  );
  if (!durationMs) return videos[0] && watchUrl(videos[0]);

  const target = durationMs / 1000;
  const isTopic = (entry: YtDlpEntry) => /- Topic$/.test(entry.channel ?? "");
  const candidates = videos
    .filter((entry) => entry.duration)
    .map((entry) => ({ entry, off: Math.abs(entry.duration! - target) }));
  // Official "- Topic" audio first, then whatever is closest in length
  const sameLength = candidates
    .filter((c) => c.off <= LENGTH_TOLERANCE_S)
    .sort((a, b) => Number(isTopic(b.entry)) - Number(isTopic(a.entry)) || a.off - b.off);
  // Nothing that long: an upload with the right title is still better than none
  const sameTitle = candidates
    .filter((c) => titlesMatch(c.entry.title, cleanTitle))
    .sort((a, b) => a.off - b.off);
  const pick = sameLength[0] ?? sameTitle[0];
  return pick && watchUrl(pick.entry);
}

/**
 * Streams a track's audio directly from yt-dlp (piped to stdout) rather than
 * extracting a url for us to fetch separately - yt-dlp's own request crafting
 * (headers, client selection, PoToken handling) is what actually gets past
 * YouTube's stricter validation for some videos, so it needs to be the one
 * doing the real download too, not just handing back a url.
 *
 * A run that fails before producing any data is retried: without cookies if
 * they were attached (see runYtDlpResilient's doc comment for why), and once
 * more as-is, since YouTube occasionally refuses a download (HTTP 403) that
 * a fresh run then gets through.
 */
export function getPlayableStream(url: string, signal: AbortSignal): Readable {
  const output = new PassThrough();
  const cookies = cookieArgs();

  const attempt = (useCookies: boolean, retriesLeft: number) => {
    const args = [
      ...BASE_ARGS,
      "-f",
      "bestaudio",
      "--no-playlist",
      "-o",
      "-",
      "--quiet",
      "--no-warnings",
      ...(useCookies ? cookies : []),
      url,
    ];

    const child = spawn(ytDlpBin(), args, { signal });
    let stderr = "";
    let gotData = false;
    // 'error' and 'close' can both fire for the same failed run
    let settled = false;

    child.stdout.once("data", () => (gotData = true));
    // Piped rather than written by hand so yt-dlp gets paused whenever the
    // reader falls behind, instead of buffering the rest of the track in
    // memory. Not ended here since a retry may follow.
    child.stdout.pipe(output, { end: false });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      console.log(`[yt-dlp] ${chunk.toString().trim()}`);
    });

    const settle = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (signal.aborted) {
        // The player has moved on (skip/seek/stop) - nobody is listening anymore
        output.destroy();
      } else if (!error) {
        output.end();
      } else if (!gotData && useCookies) {
        console.error("yt-dlp failed with cookies attached before any data arrived, retrying without them:", error);
        attempt(false, retriesLeft);
      } else if (!gotData && retriesLeft > 0) {
        console.error("yt-dlp failed before any data arrived, retrying:", error);
        setTimeout(() => attempt(false, retriesLeft - 1), RETRY_DELAY_MS);
      } else {
        output.destroy(error);
      }
    };

    child.on("error", settle);
    // A null code means it was killed by something other than our abort (e.g.
    // the OOM killer) - a failure, not the end of the track
    child.on("close", (code) => settle(code === 0 ? undefined : exitError(code, stderr)));
  };

  attempt(cookies.length > 0, 1);
  return output;
}

// How often a long-running bot checks for a newer yt-dlp
const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Generous, since an update downloads the whole binary
const UPDATE_TIMEOUT_MS = 5 * 60_000;

/**
 * Keeps yt-dlp current: YouTube changes break older releases within weeks,
 * and the bot can run far longer than that. Checks at startup and daily
 * after. yt-dlp swaps its binary in with a single rename, so runs already in
 * progress are unaffected. A copy installed through a package manager (pip,
 * distro packages) refuses to update itself - that just gets logged. Set
 * YTDLP_AUTO_UPDATE=false to turn this off.
 */
export function startYtDlpAutoUpdate() {
  if (process.env.YTDLP_AUTO_UPDATE === "false") return;

  const update = () => {
    const child = spawn(ytDlpBin(), ["--update"], { timeout: UPDATE_TIMEOUT_MS });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", (error) => console.error("Failed to run the yt-dlp update check:", error));
    child.on("close", (code) => {
      const summary = output.trim().split("\n").slice(-2).join(" | ");
      if (code === 0) {
        console.log(`[yt-dlp] update check: ${summary}`);
      } else {
        console.error(`yt-dlp update check failed (${code === null ? "killed" : `code ${code}`}): ${summary}`);
      }
    });
  };

  update();
  setInterval(update, UPDATE_INTERVAL_MS).unref();
}
