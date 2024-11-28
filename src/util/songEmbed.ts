import { EmbedBuilder } from "discord.js";
import { Track } from "shoukaku";
import { timeConvert } from "./timeConvert";

export const createEmbed = (metadata: Track) => {
  const coverColor = "#ff0000";
  const embed = new EmbedBuilder()
    .setColor(coverColor)
    .setTitle("Song queued")
    .addFields(
      { inline: true, name: "Title", value: metadata.info?.title || "Unknown" },
      {
        inline: true,
        name: "Artist",
        value: metadata.info?.author || "Unknown",
      },
      {
        inline: true,
        name: "Length",
        value:
          (metadata.info?.length < 9223372036854776
            ? timeConvert(metadata.info?.length)
            : "🔴 Live") || "Unknown",
      }
    );
  return embed;
};

export const createPlaylistEmbed = (metadata: Track[]) => {
  const coverColor = "#ff0000";
  let totalLength = 0;
  for (let i = 0; i < metadata.length; i++) {
    totalLength += metadata[i].info?.length ?? 0;
  }
  const embed = new EmbedBuilder()
    .setColor(coverColor)
    .setTitle("Playlist queued")
    .addFields(
      { inline: true, name: "Count", value: metadata.length.toString() || "Unknown" },
      {
        inline: true,
        name: "Length",
        value:
          (totalLength < 9223372036854776
            ? timeConvert(totalLength)
            : "🔴 Live") || "Unknown",
      }
    );
  return embed;
};

export const createNowPlayingEmbed = (metadata: Track) => {
  const coverColor = "#ff0000";
  const embed = new EmbedBuilder()
    .setColor(coverColor)
    .setTitle("Now playing")
    .setDescription(metadata.info?.title || "Unknown")
    .addFields(
      {
        inline: true,
        name: "Artist",
        value: metadata.info?.author || "Unknown",
      },
      {
        inline: true,
        name: "Length",
        value:
          (metadata.info?.length < 9223372036854776
            ? timeConvert(metadata.info?.length)
            : "🔴 Live") || "Unknown",
      }
    );
  if (metadata.info?.artworkUrl)
    embed.setImage(metadata.info.artworkUrl);
  return embed;
};
