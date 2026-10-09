import { TrackInfo } from "./trackTypes";
import { cleanSongTitle } from "./ytSource";

/**
 * Lyrics come from LRCLIB (https://lrclib.net), a free, community-run
 * lyrics database: no API key, and time-synced lyrics for most songs. Its
 * entries are user-submitted, so one too short to be real lyrics (a stray
 * test entry, say) is passed over for another.
 */

const API = "https://lrclib.net/api";
// LRCLIB asks clients to identify themselves
const USER_AGENT = "Musabotti (https://github.com/N1kO23/Musabotti)";
const REQUEST_TIMEOUT_MS = 8000;
// The public server sometimes answers 503 "busy"; a retry usually gets through
const RETRY_DELAY_MS = 1000;
// Fewer lines than this isn't real lyrics
const MIN_LINES = 4;
// How far an entry's length may be from the song's to count as the same recording
const LENGTH_TOLERANCE_S = 5;
const CACHE_SIZE = 200;

export interface SyncedLine {
  timeMs: number;
  text: string;
}

export interface Lyrics {
  trackName: string;
  artistName: string;
  instrumental: boolean;
  plain?: string;
  /** Only when the timestamps fit the song being played (same length) */
  synced?: SyncedLine[];
}

interface LrclibEntry {
  trackName: string;
  artistName: string;
  duration?: number;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A request to LRCLIB, or undefined for a 404 */
async function request<T>(endpoint: string, params: Record<string, string>): Promise<T | undefined> {
  const url = `${API}/${endpoint}?${new URLSearchParams(params)}`;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) return undefined;
    if (response.ok) return (await response.json()) as T;
    if (response.status !== 503 || attempt === 2) {
      throw new Error(`The lyrics service is having trouble right now (${response.status}), try again in a moment`);
    }
    await sleep(RETRY_DELAY_MS);
  }
}

const lineCount = (text: string | null) => text?.split("\n").filter((line) => line.trim()).length ?? 0;

const isUsable = (entry: LrclibEntry) =>
  entry.instrumental || lineCount(entry.plainLyrics) >= MIN_LINES || lineCount(entry.syncedLyrics) >= MIN_LINES;

const lengthFits = (entry: LrclibEntry, durationS?: number) =>
  !durationS || !entry.duration || Math.abs(entry.duration - durationS) <= LENGTH_TOLERANCE_S;

/** The best usable entry: same length as the song if any are, synced lyrics first */
function pickBest(entries: LrclibEntry[], durationS?: number) {
  const usable = entries.filter(isUsable);
  const sameLength = usable.filter((entry) => lengthFits(entry, durationS));
  const pool = sameLength.length ? sameLength : usable;
  return pool.find((entry) => entry.syncedLyrics) ?? pool[0];
}

const LRC_TIME_RE = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

/** "[01:23.45] text" lines into timed lines, in order. A line can carry several timestamps. */
export function parseLrc(lrc: string): SyncedLine[] {
  const lines: SyncedLine[] = [];
  for (const raw of lrc.split("\n")) {
    const text = raw.replace(LRC_TIME_RE, "").trim();
    for (const [, minutes, seconds] of raw.matchAll(LRC_TIME_RE)) {
      lines.push({ timeMs: Math.round((Number(minutes) * 60 + Number(seconds)) * 1000), text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

function toLyrics(entry: LrclibEntry, durationS?: number): Lyrics {
  const synced = entry.syncedLyrics ? parseLrc(entry.syncedLyrics) : undefined;
  return {
    trackName: entry.trackName,
    artistName: entry.artistName,
    instrumental: entry.instrumental,
    plain: entry.plainLyrics?.trim() || synced?.map((line) => line.text).join("\n") || undefined,
    // Timestamps from a different recording (live, extended) wouldn't line up
    synced: synced?.length && lengthFits(entry, durationS) ? synced : undefined,
  };
}

/**
 * The artist and title to look a track's lyrics up by. YouTube, SoundCloud
 * and file titles are usually "Artist - Song (Official Video)"; Spotify's
 * are the bare song name, with the artists listed separately.
 */
export function songOf(track: TrackInfo): { artist: string; title: string } {
  const firstArtist = track.author.split(",")[0].trim();
  if (track.source === "spotify") return { artist: firstArtist, title: cleanSongTitle(track.title) };

  const title = cleanSongTitle(
    track.title
      .replace(/\.(mp3|wav|ogg|oga|m4a|flac|opus|aac|webm|wma)$/i, "")
      .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/g, "")
      .split(" | ")[0],
  );
  const dashed = title.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashed) return { artist: dashed[1].trim(), title: dashed[2].trim() };
  // No artist in the title: the channel's name, without YouTube's channel suffixes
  return { artist: firstArtist.replace(/\s*-\s*topic$/i, "").replace(/vevo$/i, "").trim(), title };
}

async function lookup(track: TrackInfo): Promise<Lyrics | undefined> {
  const { artist, title } = songOf(track);
  const durationS = track.durationMs ? Math.round(track.durationMs / 1000) : undefined;

  // Search only covers LRCLIB's own database, so it's quick and dependable
  let entry = pickBest((await request<LrclibEntry[]>("search", { artist_name: artist, track_name: title })) ?? [], durationS);
  if (!entry && durationS) {
    // An exact lookup also checks LRCLIB's outside sources, which the public
    // server is sometimes too busy for - not finding it there is fine
    const exact = await request<LrclibEntry>("get", {
      artist_name: artist,
      track_name: title,
      duration: String(durationS),
    }).catch(() => undefined);
    if (exact && isUsable(exact)) entry = exact;
  }
  entry ??= pickBest((await request<LrclibEntry[]>("search", { q: `${artist} ${title}` })) ?? [], durationS);
  return entry && toLyrics(entry, durationS);
}

// Track url -> lyrics, shared by /lyrics and live lyrics
const cache = new Map<string, Promise<Lyrics | undefined>>();

/** A track's lyrics, or undefined if LRCLIB has none */
export function findLyrics(track: TrackInfo): Promise<Lyrics | undefined> {
  const cached = cache.get(track.url);
  if (cached) return cached;
  const lyrics = lookup(track);
  cache.set(track.url, lyrics);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  // A failed lookup is retried next time rather than remembered
  lyrics.catch(() => cache.delete(track.url));
  return lyrics;
}

/** Lyrics for a song someone typed, e.g. "fleetwood mac dreams": LRCLIB's best match */
export async function searchLyrics(query: string): Promise<Lyrics | undefined> {
  const entry = pickBest((await request<LrclibEntry[]>("search", { q: query })) ?? []);
  return entry && toLyrics(entry);
}
