import { Client, Message } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, IArgument, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "pause";
  commandDescription = "Toggles pause the currently playing song";
  aliases = [];
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
      const paused = await playerInstance.togglePausePlayer();
      context.reply(paused ? "Playback paused!" : "Playback resumed!");
    } else {
      context.reply("I am not connected to any voice channels!");
    }
  };
  parseArgs = (args: string[]) => [];
}

export default Command;
