import { Client, EmbedBuilder } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, IArgument, ICommand } from "../interfaces";
import { Context } from "../classes/context";
import { getCommandNamesAndDescriptions } from ".";

class Command implements ICommand {
  commandName = "help";
  commandDescription = "Sends an embed that displays the available commands";
  aliases = ["h", "?"];
  conditions = [];
  slashOptions = [];
  execute = (
    shoukaku: Shoukaku,
    client: Client<boolean>,
    context: Context,
    args: IArgument[]
  ) => {
    const commands = getCommandNamesAndDescriptions();
    const embed = new EmbedBuilder().setColor("DarkOrange").setTitle("Help");

    commands.forEach((command) => {
      embed.addFields({ name: command.name, value: command.desc });
    });

    context.reply({ embeds: [embed] });
  };
  parseArgs = (args: string[]) => [];
}

export default Command;
