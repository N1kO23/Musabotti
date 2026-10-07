import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skips the currently playing song to a next one"),
  conditions: [CONDITIONS.SameVoice],
  execute: async (context) => {
    const player = await getPlayer(context.client, { context, noCreate: true });
    if (!player) {
      await context.reply("I am not connected to any voice channels!");
      return;
    }
    // Reply first: resolving the next track can outlast Discord's 3s reply window
    await context.reply("Skipped!");
    await player.skipSong();
  },
};

export default command;
