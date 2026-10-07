import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";
import { formatTitle } from "../util";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Removes a song from the queue")
    .addIntegerOption((option) =>
      option
        .setName("position")
        .setDescription("The song's position in /queue")
        .setMinValue(1)
        .setRequired(true),
    ),
  conditions: [CONDITIONS.SameVoice, CONDITIONS.PlayerExists, CONDITIONS.QueueNotEmpty],
  execute: async (context, interaction) => {
    const player = getPlayerInstance(context.guildId);
    const removed = player.removeFromQueue(interaction.options.getInteger("position", true));
    await context.reply(`🗑️ Removed ${formatTitle(removed.track)} from the queue`);
  },
};

export default command;
