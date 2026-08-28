import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ICommand } from "../interfaces";
import { getCommandNamesAndDescriptions } from ".";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Sends an embed that displays the available commands"),
  conditions: [],
  execute: async (context) => {
    const commands = getCommandNamesAndDescriptions();
    const embed = new EmbedBuilder().setColor("DarkOrange").setTitle("Help");

    commands.forEach((command) => {
      embed.addFields({ name: `/${command.name}`, value: command.description });
    });

    await context.reply({ embeds: [embed] });
  },
};

export default command;
