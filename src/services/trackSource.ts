import { Readable } from "stream";
import * as fileSource from "./fileSource";
import * as soundcloudSource from "./soundcloudSource";
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
 * "scsearch:" query or a SoundCloud link goes to SoundCloud, a direct link to
 * an audio file plays directly, and everything else (YouTube urls and plain
 * keyword searches) goes to YouTube. Audio files are usually recognized by
 * their url extension; urls without one (some CDNs serve audio behind a
 * hash/id path with no extension at all) fall back to checking the actual
 * Content-Type before giving up and treating it as an unsupported YouTube link.
 */
export async function resolve(query: string): Promise<ResolveResult> {
  if (SCSEARCH_PREFIX_RE.test(query)) {
    return soundcloudSource.resolve(query.replace(SCSEARCH_PREFIX_RE, ""));
  }
  if (SOUNDCLOUD_RE.test(query)) return soundcloudSource.resolve(query);

  const isUrl = URL_RE.test(query);
  if (isUrl && AUDIO_FILE_EXT_RE.test(query)) return fileSource.resolve(query);
  if (isUrl && !YOUTUBE_RE.test(query) && (await looksLikeAudioFile(query))) {
    return fileSource.resolve(query);
  }
  return ytSource.resolve(query);
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
  }
}
