import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { TimescaleSettings } from "../util/ffmpegFilters";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("nightcore")
    .setDescription(
      "Sets equalizer to be nightcore, will override the existing eq settings",
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
      .setTitle("Nightcore")
      .setDescription("Applying nightcore settings...");
    await context.reply({ embeds: [embed] });

    const timescale: TimescaleSettings = { speed: 1.08, pitch: 1.08, rate: 1.08 };
    await player.setFilters({ timescale });

    await context.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("DarkRed")
          .setTitle("Nightcore")
          .setDescription("Nightcore settings applied!"),
      ],
    });
  },
};

export default command;
