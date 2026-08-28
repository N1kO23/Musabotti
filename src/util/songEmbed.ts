import { EmbedBuilder } from "discord.js";
import { TrackInfo } from "../services/trackSource";
import { timeConvert } from "./timeConvert";

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
