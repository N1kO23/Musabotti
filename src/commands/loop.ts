import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Loops the currently playing song"),
  conditions: [CONDITIONS.SameVoice],
  execute: async (context) => {
    const player = await getPlayer(context.client, { context, noCreate: true });
    if (!player) {
      await context.reply("I am not connected to any voice channels!");
      return;
    }
    const val = player.toggleLoop();
    await context.reply(`Looping set to ${val}`);
  },
};

export default command;
