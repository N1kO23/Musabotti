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
const YTDLP_BIN = process.env.YTDLP_PATH ?? "yt-dlp";

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
    const child = spawn(YTDLP_BIN, [...BASE_ARGS, ...args], {
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

  const output = await runYtDlpResilient(args);

  const entries: YtDlpEntry[] = output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

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

/**
 * Streams a track's audio directly from yt-dlp (piped to stdout) rather than
 * extracting a url for us to fetch separately - yt-dlp's own request crafting
 * (headers, client selection, PoToken handling) is what actually gets past
 * YouTube's stricter validation for some videos, so it needs to be the one
 * doing the real download too, not just handing back a url.
 *
 * Retries once without cookies if the cookie-attached attempt fails before
 * producing any data - see runYtDlpResilient's doc comment for why.
 */
export function getPlayableStream(url: string, signal: AbortSignal): Readable {
  const output = new PassThrough();
  const cookies = cookieArgs();

  const attempt = (useCookies: boolean) => {
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

    const child = spawn(YTDLP_BIN, args, { signal });
    let stderr = "";
    let gotData = false;
    // 'error' and 'close' can both fire for the same failed run
    let settled = false;

    child.stdout.once("data", () => (gotData = true));
    // Piped rather than written by hand so yt-dlp gets paused while ffmpeg is
    // behind: it downloads far faster than real time, which would otherwise
    // buffer the whole track in memory. Not ended here since a retry may follow.
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
      } else if (useCookies && cookies.length > 0 && !gotData) {
        console.error("yt-dlp failed with cookies attached before any data arrived, retrying without them:", error);
        attempt(false);
      } else {
        output.destroy(error);
      }
    };

    child.on("error", settle);
    // A null code means it was killed by something other than our abort (e.g.
    // the OOM killer) - a failure, not the end of the track
    child.on("close", (code) => settle(code === 0 ? undefined : exitError(code, stderr)));
  };

  attempt(cookies.length > 0);
  return output;
}
