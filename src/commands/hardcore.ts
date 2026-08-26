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
  commandName = "hardcore";
  commandDescription =
    "Sets equalizer to be hardcore, will override the existing eq settings";
  aliases = ["hc"];
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
      const embed = new EmbedBuilder().setColor("DarkRed").setTitle("Hardcore");

      embed.setDescription("Applying hardcore settings...");

      await context.reply({ embeds: [embed] });

      const eqBands: Band[] = [
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

      await playerInstance.setEqualizer(eqBands);

      const newEmbed = new EmbedBuilder()
        .setColor("DarkRed")
        .setTitle("Hardcore");

      newEmbed.setDescription("Hardcore settings applied!");
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
