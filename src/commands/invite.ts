import { SlashCommandBuilder } from "discord.js";
import { ICommand } from "../interfaces";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Sends a bot invite link to the channel"),
  conditions: [],
  execute: async (context) => {
    await context.reply(
      "https://discord.com/api/oauth2/authorize?client_id=1080603331954749502&permissions=281424547136&scope=bot",
    );
  },
};

export default command;
