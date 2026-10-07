import { EmbedBuilder, escapeMarkdown } from "discord.js";
import type { LoopMode } from "../services/player";
import { TrackInfo } from "../services/trackSource";
import { truncateString } from "./strManipulators";
import { timeConvert, timeConvert2 } from "./timeConvert";

const PROGRESS_BAR_WIDTH = 18;

export const LOOP_MODE_LABELS: Record<LoopMode, string> = {
  off: "Loop off",
  track: "🔂 Looping the song",
  queue: "🔁 Looping the queue",
};

/** A track's title for use inside a message, bolded and safe from stray markdown */
export const formatTitle = (track: TrackInfo, maxLength = 80) =>
  `**${escapeMarkdown(truncateString(track.title || "Unknown", maxLength))}**`;

/** "1:23 / 3:45", or just "1:23" when the length is unknown */
export const formatProgress = (track: TrackInfo, positionMs: number) => {
  if (track.isLive) return "🔴 Live";
  if (!track.durationMs) return timeConvert2(positionMs);
  return `${timeConvert2(Math.min(positionMs, track.durationMs))} / ${timeConvert2(track.durationMs)}`;
};

const progressBar = (positionMs: number, durationMs: number) => {
  const filled = Math.round(Math.min(1, positionMs / durationMs) * PROGRESS_BAR_WIDTH);
  return `${"▬".repeat(filled)}🔘${"▬".repeat(PROGRESS_BAR_WIDTH - filled)}`;
};

export const createPlaybackEmbed = (
  track: TrackInfo,
  status: { positionMs: number; paused: boolean; loopMode: LoopMode; volume: number },
) => {
  const lines: string[] = [];
  if (track.durationMs && !track.isLive) {
    lines.push(progressBar(status.positionMs, track.durationMs));
  }
  lines.push(`\`${formatProgress(track, status.positionMs)}\``);

  const details = [status.paused ? "⏸ Paused" : "▶ Playing"];
  if (status.loopMode !== "off") details.push(LOOP_MODE_LABELS[status.loopMode]);
  if (status.volume !== 1) details.push(`🔊 ${Math.round(status.volume * 100)}%`);
  lines.push(details.join(" · "));

  const embed = new EmbedBuilder()
    .setColor("#ff0000")
    .setAuthor({ name: track.author || "Unknown" })
    .setTitle(truncateString(track.title || "Unknown", 256))
    .setURL(track.url)
    .setDescription(lines.join("\n"));
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
};

const formatLength = (track: TrackInfo) => {
  if (track.isLive) return "🔴 Live";
  if (!track.durationMs) return "Unknown";
  return timeConvert(track.durationMs);
};

export const createEmbed = (track: TrackInfo) => {
  const coverColor = "#ff0000";
  const embed = new EmbedBuilder()
    .setColor(coverColor)
    .setTitle("Song queued")
    .addFields(
      { inline: true, name: "Title", value: track.title || "Unknown" },
      { inline: true, name: "Artist", value: track.author || "Unknown" },
      {
        inline: true,
        name: "Length",
        value: formatLength(track),
      },
    );
  if (track.thumbnail) embed.setThumbnail(track.thumbnail);
  return embed;
};

export const createPlaylistEmbed = (tracks: TrackInfo[]) => {
  const coverColor = "#ff0000";
  const totalLength = tracks.reduce((sum, track) => sum + track.durationMs, 0);
  const embed = new EmbedBuilder()
    .setColor(coverColor)
    .setTitle("Playlist queued")
    .addFields(
      { inline: true, name: "Count", value: tracks.length.toString() },
      {
        inline: true,
        name: "Length",
        value: tracks.some((t) => t.isLive) ? "🔴 Live" : timeConvert(totalLength),
      },
    );
  return embed;
};

export const createNowPlayingEmbed = (track: TrackInfo) => {
  const coverColor = "#ff0000";
  const embed = new EmbedBuilder()
    .setColor(coverColor)
    .setTitle("Now playing")
    .setDescription(track.title || "Unknown")
    .addFields(
      { inline: true, name: "Artist", value: track.author || "Unknown" },
      {
        inline: true,
        name: "Length",
        value: formatLength(track),
      },
    );
  if (track.thumbnail) embed.setImage(track.thumbnail);
  return embed;
};
