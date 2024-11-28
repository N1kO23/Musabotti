import { Client, EmbedBuilder, Message } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, CommandTypes, IArgument, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "volume";
  commandDescription = "Adjust the player volume";
  aliases = ["v", "vol"];
  conditions = [CONDITIONS.SameVoice];
  slashOptions = [
    {
      name: "volume",
      description: "The volume value as %",
      type: CommandTypes.NUMBER,
      required: true,
    },
  ];
  execute = async (
    shoukaku: Shoukaku,
    client: Client,
    context: Context,
    args: IArgument[]
  ) => {
    if (!shoukaku) return;
    if (!context.guildId || !context.member?.voice.channelId) return;

    const playerInstance = await getPlayer(shoukaku, {
      context,
      noCreate: true,
    });
    if (playerInstance) {
      const volumeArg = args.find((arg) => arg.name === "volume");
      if (!volumeArg) {
        context.reply("How the fuck did you do that?");
        return;
      }
      const actualVolume = volumeArg.value > 500 ? 500 : volumeArg.value;
      const embed = new EmbedBuilder().setColor("DarkRed").setTitle("Volume").setDescription(actualVolume.toString() + '%');

      context.reply({ embeds: [embed] });
      await playerInstance.setVolume(actualVolume / 100);
    } else {
      context.reply("I am not connected to any voice channels!");
    }
  };
  parseArgs = (args: string[]) => {
    return [{ name: "volume", type: CommandTypes.NUMBER, value: args[0] }];
  };
}

export default Command;
