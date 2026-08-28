import Soundcloud from "soundcloud.ts";
import type { SoundcloudTrack } from "soundcloud.ts";
import { ResolveResult, TrackInfo } from "./trackTypes";

const PLAYLIST_RE = /\/sets\//i;
const URL_RE = /^https?:\/\//i;

/**
 * SoundCloud's resolve/get API only recognizes the bare soundcloud.com host -
 * "m.soundcloud.com" (mobile web) and "www.soundcloud.com" links 404 on it
 * unchanged. "on.soundcloud.com" links (the app's share button) are a
 * separate short-link redirector entirely, resolved by just following the
 * HTTP redirect to the real url.
 */
async function normalizeUrl(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.hostname === "on.soundcloud.com" || parsed.hostname === "snd.sc") {
    const response = await fetch(url, { redirect: "follow" });
    return response.url;
  }
  if (parsed.hostname === "m.soundcloud.com" || parsed.hostname === "www.soundcloud.com") {
    parsed.hostname = "soundcloud.com";
    return parsed.toString();
  }
  return url;
}

let client: Soundcloud | undefined;

// The client id is auto-discovered by the library if not provided (it scrapes
// soundcloud.com's own bundle for it, the same way a browser session would
// pick it up) - SOUNDCLOUD_CLIENT_ID/SOUNDCLOUD_OAUTH_TOKEN are optional and
// only needed for content that requires a specific account (private tracks).
function getClient() {
  if (!client) {
    client = new Soundcloud(process.env.SOUNDCLOUD_CLIENT_ID, process.env.SOUNDCLOUD_OAUTH_TOKEN);
  }
  return client;
}

function toTrackInfo(track: SoundcloudTrack, url?: string): TrackInfo {
  return {
    source: "soundcloud",
    url: url ?? track.permalink_url,
    title: track.title,
    author: track.user?.username ?? "Unknown",
    durationMs: track.duration,
    thumbnail: track.artwork_url ?? track.user?.avatar_url ?? undefined,
    isLive: false,
  };
}

export async function resolve(query: string): Promise<ResolveResult> {
  const sc = getClient();

  if (URL_RE.test(query)) {
    query = await normalizeUrl(query);
  }

  if (PLAYLIST_RE.test(query)) {
    const playlist = await sc.playlists.getAlt(query);
    return { isPlaylist: true, tracks: playlist.tracks.map((t) => toTrackInfo(t)) };
  }

  if (URL_RE.test(query)) {
    // getAlt() scrapes the real page at this exact url, which is what a
    // private/unlisted track's ?secret_token=... needs to work - tracks.get()
    // resolves the url to a bare track id and re-fetches by id alone,
    // dropping the token (and access) along the way.
    const track = await sc.tracks.getAlt(query);
    return { isPlaylist: false, tracks: [toTrackInfo(track, query)] };
  }

  const results = await sc.tracks.search({ q: query });
  const hit = results.collection[0];
  if (!hit) throw new Error("No SoundCloud results found for that search");
  return { isPlaylist: false, tracks: [toTrackInfo(hit)] };
}

/**
 * Fetches a fresh direct-stream url for a track. Only the "progressive"
 * transcoding is used (a plain MP3 file url) rather than HLS, since that's
 * what our resumable-fetch-into-ffmpeg pipeline expects - a single
 * range-resumable resource, not a segmented playlist. Nearly all SoundCloud
 * tracks have one; the rare HLS-only track will surface a clear error instead
 * of silently failing.
 *
 * Re-scrapes via getAlt (see resolve() above) rather than passing the url
 * straight to streamLink, which would internally re-resolve it through the
 * same token-dropping tracks.get() path for private/unlisted tracks.
 */
export async function getPlayableUrl(url: string): Promise<string> {
  const sc = getClient();
  const track = await sc.tracks.getAlt(url);
  const streamUrl = await sc.util.streamLink(track, "progressive");
  if (!streamUrl) throw new Error("This SoundCloud track has no playable stream available");
  return streamUrl;
}
