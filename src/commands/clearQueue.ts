import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Empties the queue, keeping the current song playing"),
  conditions: [CONDITIONS.SameVoice, CONDITIONS.PlayerExists, CONDITIONS.QueueNotEmpty],
  execute: async (context) => {
    const removed = getPlayerInstance(context.guildId).clearQueue();
    await context.reply(`🧹 Cleared ${removed} song${removed === 1 ? "" : "s"} from the queue`);
  },
};

export default command;
