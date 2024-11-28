import { Client, Message } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, IArgument, ICommand } from "../interfaces";
import { removePlayer } from "../services/player";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "disconnect";
  commandDescription = "Disconnects from the voice chat";
  aliases = ["leave", "fuckoff", "foff", "vittuun", "quit", "dc"];
  conditions = [CONDITIONS.SameVoice];
  slashOptions = [];
  execute = async (
    shoukaku: Shoukaku,
    client: Client,
    context: Context,
    args: IArgument[]
  ) => {
    if (!shoukaku) return;
    if (!context.guildId || !context.member?.voice.channelId) return;

    const playerInstance = await removePlayer({
      context,
    });
    if (playerInstance) {
      context.reply("I left chat " + context.member.voice.channel?.name);
    } else {
      context.reply("Lol no");
    }
  };
  parseArgs = (args: string[]) => [];
}

export default Command;
