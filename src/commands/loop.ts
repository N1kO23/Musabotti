import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { LoopMode, getPlayerInstance } from "../services/player";
import { LOOP_MODE_LABELS } from "../util";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Loops the current song or the whole queue")
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("What to loop - leave empty to cycle off → song → queue")
        .addChoices(
          { name: "Off", value: "off" },
          { name: "Current song", value: "track" },
          { name: "Whole queue", value: "queue" },
        )
        .setRequired(false),
    ),
  conditions: [CONDITIONS.SameVoice, CONDITIONS.PlayerExists],
  execute: async (context, interaction) => {
    const player = getPlayerInstance(context.guildId);
    const chosen = interaction.options.getString("mode") as LoopMode | null;
    if (chosen) player.setLoopMode(chosen);
    else player.cycleLoopMode();
    player.refreshControls();
    await context.reply(LOOP_MODE_LABELS[player.getLoopMode()]);
  },
};

export default command;
