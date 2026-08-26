import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("hardcore")
    .setDescription(
      "Sets equalizer to be hardcore, will override the existing eq settings",
    ),
  conditions: [CONDITIONS.SameVoice],
  execute: async (context) => {
    const player = await getPlayer(context.client, { context, noCreate: true });
    if (!player) {
      await context.reply("I am not connected to any voice channels!");
      return;
    }

    const embed = new EmbedBuilder()
      .setColor("DarkRed")
      .setTitle("Hardcore")
      .setDescription("Applying hardcore settings...");
    await context.reply({ embeds: [embed] });

    const eqBands = [
      { band: 0, gain: 0.75 },
      { band: 1, gain: 0.5 },
      { band: 2, gain: 0.5 },
      { band: 3, gain: -0.25 },
      { band: 4, gain: 0 },
      { band: 5, gain: 0 },
      { band: 6, gain: 0 },
      { band: 7, gain: 0.25 },
      { band: 8, gain: 0.15 },
      { band: 9, gain: 0.15 },
    ];

    await player.setFilters({ equalizerBands: eqBands });

    await context.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("DarkRed")
          .setTitle("Hardcore")
          .setDescription("Hardcore settings applied!"),
      ],
    });
  },
};

export default command;
