import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import {
  FreqSettings,
  LowPassSettings,
  TimescaleSettings,
} from "../util/ffmpegFilters";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("lofi")
    .setDescription(
      "Sets equalizer to be lofi, will override the existing eq settings",
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
      .setTitle("LoFi")
      .setDescription("Applying LoFi settings...");
    await context.reply({ embeds: [embed] });

    const timescale: TimescaleSettings = { speed: 0.9, pitch: 0.9, rate: 0.9 };
    const tremolo: FreqSettings = { frequency: 4, depth: 0.75 };
    const vibrato: FreqSettings = { frequency: 5, depth: 0.5 };
    const lowPass: LowPassSettings = { smoothing: 20 };

    // Values taken from various lofi filter presets and tweaked a bit
    const eqBands = [
      { band: 0, gain: -0.5 },
      { band: 1, gain: -0.25 },
      { band: 2, gain: -0.25 },
      { band: 3, gain: -0.25 },
      { band: 4, gain: -0.25 },
      { band: 5, gain: -0.25 },
      { band: 6, gain: 0 },
      { band: 7, gain: 0 },
      { band: 8, gain: 0.25 },
      { band: 9, gain: 0.25 },
    ];

    await player.setFilters({
      equalizerBands: eqBands,
      lowPass,
      distortion: true,
      vibrato,
      tremolo,
      timescale,
    });

    await context.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("DarkRed")
          .setTitle("LoFi")
          .setDescription("LoFi settings applied!"),
      ],
    });
  },
};

export default command;
