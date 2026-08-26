import { Client, EmbedBuilder, Message } from "discord.js";
import {
  Band,
  DistortionSettings,
  FreqSettings,
  LowPassSettings,
  Shoukaku,
  TimescaleSettings,
} from "shoukaku";
import { CONDITIONS, CommandTypes, IArgument, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "lofi";
  commandDescription =
    "Sets equalizer to be lofi, will override the existing eq settings";
  aliases = ["lf"];
  conditions = [CONDITIONS.SameVoice];
  slashOptions = [];
  execute = async (
    shoukaku: Shoukaku,
    client: Client,
    context: Context,
    args: IArgument[],
  ) => {
    if (!shoukaku) return;
    if (!context.guildId || !context.member?.voice.channelId) return;

    const playerInstance = await getPlayer(shoukaku, {
      context,
      noCreate: true,
    });
    if (playerInstance) {
      const embed = new EmbedBuilder().setColor("DarkRed").setTitle("LoFi");

      embed.setDescription("Applying LoFi settings...");

      await context.reply({ embeds: [embed] });

      const timescale: TimescaleSettings = {
        speed: 0.9,
        pitch: 0.9,
        rate: 0.9,
      };

      const tremolo: FreqSettings = {
        frequency: 4,
        depth: 0.75,
      };

      const vibrato: FreqSettings = {
        frequency: 5,
        depth: 0.5,
      };

      const distortion: DistortionSettings = {
        sinOffset: 0.5,
        cosOffset: -0.5,
        tanOffset: 0,
        offset: 0,
        scale: 1,
      };

      const lowPass: LowPassSettings = {
        smoothing: 20,
      };

      // Make this better suited for lofi music, values taken from various lofi filter presets and tweaked a bit
      const eqBands: Band[] = [
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

      await playerInstance.setEqualizer(eqBands);
      await playerInstance.setLowPass(lowPass);
      await playerInstance.setDistortion(distortion);
      await playerInstance.setVibrato(vibrato);
      await playerInstance.setTremolo(tremolo);
      await playerInstance.setTimescale(timescale);

      const newEmbed = new EmbedBuilder().setColor("DarkRed").setTitle("LoFi");

      newEmbed.setDescription("LoFi settings applied!");
      context.reply({ embeds: [newEmbed] });
    } else {
      context.reply("I am not connected to any voice channels!");
    }
  };
  parseArgs = (args: string[]) => {
    return [];
  };
}

export default Command;
