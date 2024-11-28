import { Client, EmbedBuilder, Message } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, IArgument, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { Context } from "../classes/context";
import { timeConvert } from "../util";

class Command implements ICommand {
  commandName = "queue";
  commandDescription = "Shows the music queue";
  aliases = ["q", "que"];
  conditions = [];
  slashOptions = [];
  execute = async (
    shoukaku: Shoukaku,
    client: Client,
    context: Context,
    args: IArgument[]
  ) => {
    if (!shoukaku || !context.guildId || !context.member?.voice.channelId) {
      context.reply("I ain't in a voice channel");
      return;
    }

    const playerInstance = await getPlayer(shoukaku, {
      context,
      noCreate: true,
    });
    if (playerInstance) {
      const embed = new EmbedBuilder().setColor("DarkGreen").setTitle("Queue");

      const queue = playerInstance.getQueue().slice(0, 5);
      queue.forEach((track, index) => {
        embed.addFields(
          { inline: true, name: track.track.info.title, value: track.track.info.author },
          {
            inline: true,
            name: "Length",
            value: timeConvert(track.track.info.length),
          }
        );
        embed.addFields({ name: "\u200B", value: "\u200B", inline: false }); // Add an empty field to ensure new row
      });

      context.reply({ embeds: [embed] });
    }
  };
  parseArgs = (args: string[]) => [];
}

export default Command;
