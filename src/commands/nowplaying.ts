import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";
import { createPlaybackEmbed } from "../util";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Shows the current song and how far into it we are"),
  conditions: [CONDITIONS.PlayerExists],
  execute: async (context) => {
    const player = getPlayerInstance(context.guildId);
    const current = player.getCurrentTrack();
    if (!current) {
      await context.reply("Nothing is playing right now");
      return;
    }
    const embed = createPlaybackEmbed(current.track, {
      positionMs: player.getPositionMs(),
      paused: player.isPaused(),
      loopMode: player.getLoopMode(),
      volume: player.getVolume(),
    });
    await context.reply({ embeds: [embed] });
  },
};

export default command;
