import { Readable } from "stream";
import { createResumableAudioStream } from "../util/resumableFetch";
import { ResolveResult } from "./trackTypes";

function extractFilename(url: string): string {
  try {
    const { pathname } = new URL(url);
    return decodeURIComponent(pathname.split("/").pop() || "") || "Audio file";
  } catch {
    return "Audio file";
  }
}

/**
 * Resolves a direct link to an audio file. There's no metadata service to
 * query here, so the title falls back to the filename and duration is
 * unknown until ffmpeg actually starts decoding it.
 */
export async function resolve(url: string): Promise<ResolveResult> {
  return resolveNamed(url, extractFilename(url));
}

export async function resolveNamed(url: string, filename: string): Promise<ResolveResult> {
  return {
    isPlaylist: false,
    tracks: [
      {
        source: "file",
        url,
        title: filename,
        author: "Direct file",
        durationMs: 0,
        isLive: false,
      },
    ],
  };
}

export async function getPlayableStream(url: string, signal: AbortSignal): Promise<Readable> {
  return createResumableAudioStream(url, signal);
}
