import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";
import { parseTimestamp, timeConvert2 } from "../util";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Jumps to a time in the current song")
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Where to jump to, e.g. 1:23 or 83 (seconds)")
        .setRequired(true),
    ),
  conditions: [CONDITIONS.SameVoice, CONDITIONS.PlayerExists],
  execute: async (context, interaction) => {
    const player = getPlayerInstance(context.guildId);
    const track = player.getCurrentTrack()?.track;
    if (!track) {
      await context.reply("Nothing is playing!");
      return;
    }

    const input = interaction.options.getString("time", true);
    const targetMs = parseTimestamp(input);
    if (targetMs === undefined) {
      await context.reply(`"${input}" isn't a time I understand, try something like 1:23 or 83`);
      return;
    }
    if (track.durationMs && !track.isLive && targetMs >= track.durationMs) {
      await context.reply(
        `That's past the end of the song (it's ${timeConvert2(track.durationMs)} long)`,
      );
      return;
    }

    await context.reply(`⏩ Jumped to ${timeConvert2(targetMs)}`);
    await player.seekSong(targetMs);
  },
};

export default command;
