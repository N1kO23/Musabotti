import { Readable } from "stream";
import * as fileSource from "./fileSource";
import * as soundcloudSource from "./soundcloudSource";
import * as spotifySource from "./spotifySource";
import { ResolveResult, TrackInfo } from "./trackTypes";
import * as ytSource from "./ytSource";

export * from "./trackTypes";

const SOUNDCLOUD_RE = /^https?:\/\/(www\.|m\.|on\.)?(soundcloud\.com|snd\.sc)\//i;
const YOUTUBE_RE = /^https?:\/\/(www\.|music\.)?(youtube(-nocookie)?\.com|youtu\.be)\//i;
const AUDIO_FILE_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|flac|opus|aac|webm|wma)(\?.*)?$/i;
const SCSEARCH_PREFIX_RE = /^scsearch:\s*/i;
const URL_RE = /^https?:\/\//i;

async function looksLikeAudioFile(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const contentType = response.headers.get("content-type") ?? "";
    return response.ok && (contentType.startsWith("audio/") || contentType === "application/octet-stream");
  } catch {
    return false;
  }
}

/**
 * Routes a user-provided search term or url to the right source: an explicit
 * "scsearch:" query or a SoundCloud link goes to SoundCloud, a Spotify link
 * to Spotify (played through YouTube - see spotifySource.ts), a direct link
 * to an audio file plays directly, and everything else (YouTube urls and
 * plain keyword searches) goes to YouTube. Audio files are usually recognized by
 * their url extension; urls without one (some CDNs serve audio behind a
 * hash/id path with no extension at all) fall back to checking the actual
 * Content-Type before giving up and treating it as an unsupported YouTube link.
 */
export async function resolve(query: string): Promise<ResolveResult> {
  if (SCSEARCH_PREFIX_RE.test(query)) {
    return soundcloudSource.resolve(query.replace(SCSEARCH_PREFIX_RE, ""));
  }
  if (SOUNDCLOUD_RE.test(query)) return soundcloudSource.resolve(query);
  if (spotifySource.SPOTIFY_RE.test(query)) return spotifySource.resolve(query);

  const isUrl = URL_RE.test(query);
  if (isUrl && AUDIO_FILE_EXT_RE.test(query)) return fileSource.resolve(query);
  if (isUrl && !YOUTUBE_RE.test(query) && (await looksLikeAudioFile(query))) {
    return fileSource.resolve(query);
  }
  return ytSource.resolve(query);
}

/** Suggestions while typing a /play search, which runs against YouTube like resolve() does */
export async function searchSuggestions(query: string, limit: number): Promise<TrackInfo[]> {
  return ytSource.search(query, limit);
}

/** For a Discord attachment uploaded directly to the /play command. */
export async function resolveAttachment(url: string, filename: string): Promise<ResolveResult> {
  return fileSource.resolveNamed(url, filename);
}

/**
 * Starts streaming a track's audio. Each source decides for itself how best
 * to fetch: YouTube goes through yt-dlp end to end (its own request crafting
 * is what actually gets past YouTube's validation - see ytSource.ts), while
 * SoundCloud and direct files resolve a url and fetch it in Node via the
 * shared resumable-fetch-into-ffmpeg pipeline.
 */
export async function getPlayableStream(track: TrackInfo, signal: AbortSignal): Promise<Readable> {
  switch (track.source) {
    case "youtube":
      return ytSource.getPlayableStream(track.url, signal);
    case "soundcloud":
      return soundcloudSource.getPlayableStream(track.url, signal);
    case "file":
      return fileSource.getPlayableStream(track.url, signal);
    case "spotify":
      return spotifySource.getPlayableStream(track, signal);
  }
}

/**
 * Does a track's slow setup ahead of its turn, where its source has any: a
 * Spotify song has to be matched to a YouTube upload before it can start.
 * Best-effort - a failure shows up when the track actually plays.
 */
export function prefetch(track: TrackInfo) {
  if (track.source === "spotify") spotifySource.prefetchMatch(track);
}

/**
 * The YouTube video a track's related songs are looked up from: the track
 * itself for YouTube, its match for Spotify, a search for SoundCloud. Direct
 * files have nothing to look up by.
 */
async function youtubeIdFor(track: TrackInfo): Promise<string | undefined> {
  switch (track.source) {
    case "youtube":
      return ytSource.videoIdOf(track.url);
    case "spotify": {
      const url = await spotifySource.findMatch(track);
      return url && ytSource.videoIdOf(url);
    }
    case "soundcloud": {
      const url = await ytSource.findSong(track.title, track.author, track.durationMs);
      return url && ytSource.videoIdOf(url);
    }
    case "file":
      return undefined;
  }
}

// Autoplay prefers an artist other than these last few songs'
const RECENT_ARTISTS = 2;

/**
 * Autoplay's next pick: the song most related to the first of `seeds` that
 * has one left - not one of `recent` (the same song in another upload counts
 * as played too). An artist other than the last few songs' is preferred, so
 * consecutive picks don't all come from one artist.
 */
export async function findRelatedTrack(
  seeds: TrackInfo[],
  recent: TrackInfo[],
): Promise<TrackInfo | undefined> {
  const recentArtists = recent.slice(-RECENT_ARTISTS);
  for (const seed of seeds) {
    const videoId = await youtubeIdFor(seed);
    if (!videoId) continue;
    const related = await ytSource.findRelated(videoId);
    const unplayed = related.filter((candidate) => !recent.some((track) => ytSource.isSameSong(track, candidate)));
    const pick =
      unplayed.find((candidate) => !recentArtists.some((track) => ytSource.isSameArtist(track, candidate))) ??
      unplayed[0];
    if (pick) return pick;
  }
  return undefined;
}
