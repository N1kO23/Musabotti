import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { LoopMode, getPlayerInstance } from "../services/player";
import { LOOP_MODE_LABELS } from "../util";

const NEXT_MODE: Record<LoopMode, LoopMode> = {
  off: "track",
  track: "queue",
  queue: "off",
};

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
    const mode =
      (interaction.options.getString("mode") as LoopMode | null) ??
      NEXT_MODE[player.getLoopMode()];
    player.setLoopMode(mode);
    await context.reply(LOOP_MODE_LABELS[mode]);
  },
};

export default command;
