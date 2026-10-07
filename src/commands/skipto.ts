import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";
import { formatTitle } from "../util";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("skipto")
    .setDescription("Skips straight to a song in the queue")
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
    const position = interaction.options.getInteger("position", true);
    const target = player.getQueue()[position - 1];
    if (!target) {
      await context.reply(
        `There's no song at position ${position}, the queue has ${player.getQueue().length}`,
      );
      return;
    }
    // Reply first: resolving the next track can outlast Discord's 3s reply window
    await context.reply(`⏭️ Skipping to ${formatTitle(target.track)}`);
    await player.skipTo(position);
  },
};

export default command;
