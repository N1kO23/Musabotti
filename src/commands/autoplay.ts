import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Keeps playing similar songs once the queue runs out")
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Turn autoplay on or off - leave empty to toggle")
        .setRequired(false),
    ),
  conditions: [CONDITIONS.SameVoice, CONDITIONS.PlayerExists],
  execute: async (context, interaction) => {
    const player = getPlayerInstance(context.guildId);
    const chosen = interaction.options.getBoolean("enabled");
    if (chosen === null) player.toggleAutoplay();
    else player.setAutoplay(chosen);
    player.refreshControls();
    await context.reply(
      player.isAutoplayOn()
        ? "📻 Autoplay is on: when the queue runs out, I'll keep playing similar songs"
        : "📻 Autoplay is off",
    );
  },
};

export default command;
