import { Readable } from "stream";
import { ResolveResult, TrackInfo } from "./trackTypes";
import * as ytSource from "./ytSource";

/**
 * Spotify links play through YouTube: Spotify's own audio is DRM-protected
 * and can't be rebroadcast, so this only reads which songs a link points to,
 * then finds and plays each one from YouTube (see ytSource.findSong).
 *
 * The song lists come from Spotify's public embed player page rather than
 * its Web API. Since February 2026 the API needs the app owner to have
 * Premium and only reads playlists the logged-in user owns or collaborates
 * on - not the shared or Spotify-made playlists people actually paste. The
 * embed page needs no credentials, but it's unofficial, so a change on
 * Spotify's side can break fetchEmbed() below.
 */

/** Everything resolve() accepts */
export const SPOTIFY_RE = /^(https?:\/\/(open\.spotify\.com|spotify\.link)\/|spotify:)/i;

const LINK_RE = /^https?:\/\/open\.spotify\.com\/(?:intl-[\w-]+\/)?(track|album|playlist)\/([A-Za-z0-9]+)/i;
const URI_RE = /^spotify:(track|album|playlist):([A-Za-z0-9]+)$/i;
const SHORT_LINK_RE = /^https?:\/\/spotify\.link\//i;

// spotify.link only redirects browsers; other clients get an HTML page
const BROWSER_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

// The embed page lists at most this many of a playlist's songs
const PLAYLIST_LIMIT = 100;
const MATCH_CACHE_SIZE = 500;

type SpotifyKind = "track" | "album" | "playlist";

interface EmbedEntity {
  name?: string;
  title?: string;
  artists?: { name: string }[];
  duration?: number;
  visualIdentity?: { image?: { url: string; maxWidth?: number }[] };
  trackList?: {
    uri: string;
    title: string;
    subtitle: string;
    duration: number;
    entityType?: string;
  }[];
}

const trackUrl = (id: string) => `https://open.spotify.com/track/${id}`;

async function parseLink(query: string): Promise<{ kind: SpotifyKind; id: string }> {
  let link = query.trim();
  if (SHORT_LINK_RE.test(link)) {
    // The app's share button gives these; they redirect to the full link
    const response = await fetch(link, { headers: { "user-agent": BROWSER_USER_AGENT } });
    link = response.url;
  }
  const match = link.match(LINK_RE) ?? link.match(URI_RE);
  if (!match) throw new Error("That Spotify link isn't a song, album or playlist");
  return { kind: match[1].toLowerCase() as SpotifyKind, id: match[2] };
}

async function fetchEmbed(kind: SpotifyKind, id: string): Promise<EmbedEntity> {
  const response = await fetch(`https://open.spotify.com/embed/${kind}/${id}`, {
    headers: { "user-agent": BROWSER_USER_AGENT },
  });
  if (response.status === 404) throw new Error("Couldn't find that on Spotify");
  if (!response.ok) throw new Error(`Spotify answered with an error (${response.status})`);

  const html = await response.text();
  let pageProps;
  try {
    const data = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/s)?.[1];
    pageProps = data && JSON.parse(data)?.props?.pageProps;
  } catch (error) {
    console.error("Failed to parse a Spotify embed page:", error);
  }
  // A missing song or playlist still gets a 200, with its own not-found page
  if (pageProps?.status === 404) throw new Error("Couldn't find that on Spotify");
  const entity = pageProps?.state?.data?.entity;
  if (!entity) throw new Error("Couldn't read that Spotify link");
  return entity;
}

const largestImage = (entity: EmbedEntity) =>
  entity.visualIdentity?.image?.reduce((best, image) =>
    (image.maxWidth ?? 0) > (best.maxWidth ?? 0) ? image : best,
  )?.url;

export async function resolve(query: string): Promise<ResolveResult> {
  const { kind, id } = await parseLink(query);
  const entity = await fetchEmbed(kind, id);

  if (kind === "track") {
    return {
      isPlaylist: false,
      tracks: [
        {
          source: "spotify",
          url: trackUrl(id),
          title: entity.name ?? entity.title ?? "Unknown",
          author: entity.artists?.map((artist) => artist.name).join(", ") || "Unknown",
          durationMs: entity.duration ?? 0,
          thumbnail: largestImage(entity),
          isLive: false,
        },
      ],
    };
  }

  // An album's cover is each song's cover; a playlist's isn't, and the embed
  // page has no per-song art
  const thumbnail = kind === "album" ? largestImage(entity) : undefined;
  const items = entity.trackList ?? [];
  const tracks: TrackInfo[] = items
    // Playlists can include podcast episodes, which have no YouTube match
    .filter((item) => (item.entityType ?? "track") === "track")
    .map((item) => ({
      source: "spotify",
      url: trackUrl(item.uri.split(":").pop()!),
      title: item.title,
      author: item.subtitle || "Unknown",
      durationMs: item.duration ?? 0,
      thumbnail,
      isLive: false,
    }));
  if (tracks.length === 0) throw new Error(`That Spotify ${kind} has no songs in it`);

  const notice =
    kind === "playlist" && items.length >= PLAYLIST_LIMIT
      ? `Spotify only shares the first ${PLAYLIST_LIMIT} songs of a playlist`
      : undefined;
  return { isPlaylist: true, tracks, notice };
}

// Spotify track url -> YouTube match. Promises, so a prefetch and the actual
// play of the same song share one search.
const matchCache = new Map<string, Promise<string | undefined>>();

/** A song's YouTube upload, or undefined if none was found */
export function findMatch(track: TrackInfo): Promise<string | undefined> {
  const cached = matchCache.get(track.url);
  if (cached) return cached;

  const match = ytSource.findSong(track.title, track.author, track.durationMs);
  matchCache.set(track.url, match);
  if (matchCache.size > MATCH_CACHE_SIZE) {
    matchCache.delete(matchCache.keys().next().value!);
  }
  // Failed or empty searches are retried next time rather than remembered
  match.then(
    (url) => url || matchCache.delete(track.url),
    () => matchCache.delete(track.url),
  );
  return match;
}

/** Looks up a song's YouTube match ahead of its turn, so it starts without the wait */
export function prefetchMatch(track: TrackInfo) {
  findMatch(track).catch(() => {});
}

export async function getPlayableStream(track: TrackInfo, signal: AbortSignal): Promise<Readable> {
  const url = await findMatch(track);
  if (!url) throw new Error("No YouTube match found for this song");
  return ytSource.getPlayableStream(url, signal);
}
