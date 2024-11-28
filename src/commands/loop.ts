import { Client, Message } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, IArgument, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "loop";
  commandDescription = "Loops the currently playing song";
  aliases = ["loop", "repeat"];
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

    const playerInstance = await getPlayer(shoukaku, {
      context,
      noCreate: true,
    });
    if (playerInstance) {
      const val = playerInstance.toggleLoop();
      context.reply("Looping set to " + val);
    } else {
      context.reply("I am not connected to any voice channels!");
    }
  };
  parseArgs = (args: string[]) => [];
}

export default Command;
