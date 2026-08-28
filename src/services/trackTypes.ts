export type TrackSourceKind = "youtube" | "soundcloud" | "file";

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
}
