import { Client, EmbedBuilder, Message } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, CommandTypes, IArgument, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "timescale";
  commandDescription = "Sets the time scale of the player";
  aliases = ["ts"];
  conditions = [CONDITIONS.SameVoice];
  slashOptions = [
    {
      name: "speed",
      description: "The song speed",
      type: CommandTypes.NUMBER,
      required: false,
    },
    {
      name: "pitch",
      description: "The song pitch",
      type: CommandTypes.NUMBER,
      required: false,
    },
    {
      name: "rate",
      description: "The song rate",
      type: CommandTypes.NUMBER,
      required: false,
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
      const speed = args.find((arg) => arg.name === "speed")?.value;
      const pitch = args.find((arg) => arg.name === "pitch")?.value;
      const rate = args.find((arg) => arg.name === "rate")?.value;

      const embed = new EmbedBuilder().setColor("DarkRed").setTitle("Timescale");
      embed.addFields({ name: "Speed", value: speed?.toString() ?? 'default' });
      embed.addFields({ name: "Pitch", value: pitch?.toString() ?? 'default' });
      embed.addFields({ name: "Rate", value: rate?.toString() ?? 'default' });

      context.reply({ embeds: [embed] });
      await playerInstance.setTimescale({ speed, pitch, rate });
    } else {
      context.reply("I am not connected to any voice channels!");
    }
  };
  parseArgs = (args: string[]) => {
    const parsedArgs: IArgument[] = [];
    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case "speed":
          i++;
          if (args[i])
            parsedArgs.push({ name: "speed", type: CommandTypes.NUMBER, value: args[i] });
          else
            throw new Error('Argument "speed" is missing value!');
          break;
        case "pitch":
          i++;
          if (args[i])
            parsedArgs.push({ name: "pitch", type: CommandTypes.NUMBER, value: args[i] });
          else
            throw new Error('Argument "pitch" is missing value!');
          break;
        case "rate":
          i++;
          if (args[i])
            parsedArgs.push({ name: "rate", type: CommandTypes.NUMBER, value: args[i] });
          else
            throw new Error('Argument "rate" is missing value!');
          break;
      }
    }
    return parsedArgs;
  };
}

export default Command;
