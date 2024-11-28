import { Client, EmbedBuilder, Message } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, CommandTypes, IArgument, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "bassboost";
  commandDescription = "Sets equalizer to be bass boosted, will override the existing eq settings";
  aliases = ["bb"];
  conditions = [CONDITIONS.SameVoice];
  slashOptions = [
    {
      name: "magnitude",
      description: "The bass boosting magnitude",
      type: CommandTypes.NUMBER,
      required: false,
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
      const preProcessed = args.find((arg) => arg.name === "magnitude")?.value;
      if (preProcessed == undefined || preProcessed == null)
        throw new Error("Wtf happened!!??!!!")
      const magnitude = Number.parseFloat(preProcessed);

      const embed = new EmbedBuilder().setColor("DarkRed").setTitle("Bassboost");
      embed.addFields({ name: "Magnitude", value: magnitude?.toString() ?? '1' });

      const bassboostEq = [
        {
          band: 0,
          gain: 0.8 * magnitude
        },
        {
          band: 1,
          gain: 0.3 * magnitude
        },
        {
          band: 2,
          gain: 0.2 * magnitude
        },
      ];

      context.reply({ embeds: [embed] });
      await playerInstance.setEqualizer(bassboostEq);
    } else {
      context.reply("I am not connected to any voice channels!");
    }
  };
  parseArgs = (args: string[]) => {
    return [{ name: "magnitude", type: CommandTypes.NUMBER, value: args.join(" ") }];
  };
}

export default Command;
