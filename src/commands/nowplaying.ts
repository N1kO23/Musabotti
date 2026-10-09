import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";
import { createPlaybackEmbed, createPlayerControls } from "../util";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Shows the current song and how far into it we are"),
  conditions: [CONDITIONS.PlayerExists],
  execute: async (context, interaction) => {
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
      autoplay: player.isAutoplayOn(),
      liveLyrics: player.isLiveLyricsOn(),
    });
    const response = await interaction.reply({
      embeds: [embed],
      components: createPlayerControls(player.getControlsState()),
      withResponse: true,
    });
    // Fresh controls at the bottom of the chat, replacing the older set
    const message = response.resource?.message;
    if (message) player.setControlsMessage(message);
  },
};

export default command;
