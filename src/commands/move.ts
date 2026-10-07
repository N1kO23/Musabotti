import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";
import { formatTitle } from "../util";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("move")
    .setDescription("Moves a song to a different spot in the queue")
    .addIntegerOption((option) =>
      option
        .setName("from")
        .setDescription("The song's current position in /queue")
        .setMinValue(1)
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("to")
        .setDescription("The position to move it to")
        .setMinValue(1)
        .setRequired(true),
    ),
  conditions: [CONDITIONS.SameVoice, CONDITIONS.PlayerExists, CONDITIONS.QueueNotEmpty],
  execute: async (context, interaction) => {
    const player = getPlayerInstance(context.guildId);
    const to = interaction.options.getInteger("to", true);
    const moved = player.moveInQueue(interaction.options.getInteger("from", true), to);
    await context.reply(`↕️ Moved ${formatTitle(moved.track)} to position ${to}`);
  },
};

export default command;
