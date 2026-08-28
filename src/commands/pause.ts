import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Toggles pause the currently playing song"),
  conditions: [CONDITIONS.SameVoice],
  execute: async (context) => {
    const player = await getPlayer(context.client, { context, noCreate: true });
    if (!player) {
      await context.reply("I am not connected to any voice channels!");
      return;
    }
    const paused = player.togglePausePlayer();
    await context.reply(paused ? "Playback paused!" : "Playback resumed!");
  },
};

export default command;
