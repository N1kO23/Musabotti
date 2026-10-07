import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stops the music and empties the queue, staying in the voice channel"),
  conditions: [CONDITIONS.SameVoice, CONDITIONS.PlayerExists],
  execute: async (context) => {
    getPlayerInstance(context.guildId).stop();
    await context.reply("⏹️ Stopped and cleared the queue");
  },
};

export default command;
