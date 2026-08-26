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
  commandName = "nightcore";
  commandDescription =
    "Sets equalizer to be nightcore, will override the existing eq settings";
  aliases = ["nc"];
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
      const embed = new EmbedBuilder()
        .setColor("DarkRed")
        .setTitle("Nightcore");

      embed.setDescription("Applying nightcore settings...");

      await context.reply({ embeds: [embed] });

      const timescale: TimescaleSettings = {
        speed: 1.08,
        pitch: 1.08,
        rate: 1.08,
      };

      await playerInstance.setTimescale(timescale);

      const newEmbed = new EmbedBuilder()
        .setColor("DarkRed")
        .setTitle("Nightcore");

      newEmbed.setDescription("Nightcore settings applied!");
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
