import { Client } from "discord.js";
import { Shoukaku } from "shoukaku";
import { CONDITIONS, IArgument, ICommand } from "../interfaces";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "invite";
  commandDescription = "Sends a bot invite link to the channel";
  aliases = ["inv"];
  conditions = [];
  slashOptions = [];
  execute = (
    shoukaku: Shoukaku,
    client: Client<boolean>,
    context: Context,
    args: IArgument[]
  ) => {
    context.reply(
      "https://discord.com/api/oauth2/authorize?client_id=1080603331954749502&permissions=281424547136&scope=bot"
    );
  };
  parseArgs = (args: string[]) => [];
}

export default Command;
