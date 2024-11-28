import { Client, EmbedBuilder, Message } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, CommandTypes, IArgument, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "seek";
  commandDescription = "Seeks to desired time of the song";
  aliases = ["sk", "jump", "seekto", "jumpto"];
  conditions = [CONDITIONS.SameVoice];
  slashOptions = [
    {
      name: "timestamp",
      description: "The timestamp to jump to in seconds (can do decimal accuracy)",
      type: CommandTypes.NUMBER,
      required: true,
    }
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
      const target = args.find((arg) => arg.name === "timestamp")?.value * 1000;

      const embed = new EmbedBuilder().setColor("DarkBlue").setTitle("Seek");
      embed.addFields({ name: "Timestamp", value: target?.toString() ?? '0' });

      context.reply({ embeds: [embed] });
      await playerInstance.seekSong(target);
    } else {
      context.reply("I am not connected to any voice channels!");
    }
  };
  parseArgs = (args: string[]) => {
    return [{ name: "timestamp", type: CommandTypes.NUMBER, value: Number.parseFloat(args[0]) }];
  };
}

export default Command;
