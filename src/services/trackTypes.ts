export type TrackSourceKind = "youtube" | "soundcloud" | "file" | "spotify";

export interface TrackInfo {
  source: TrackSourceKind;
  url: string;
  title: string;
  author: string;
  durationMs: number;
  thumbnail?: string;
  isLive: boolean;
}

export interface ResolveResult {
  tracks: TrackInfo[];
  isPlaylist: boolean;
  /** Something worth telling the user about the result, e.g. that a playlist was cut short */
  notice?: string;
}
