import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ICommand } from "../interfaces";
import { getCommandNamesAndDescriptions } from ".";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Sends an embed that displays the available commands"),
  conditions: [],
  execute: async (context) => {
    // One line per command rather than a field each: embeds cap out at 25 fields
    const lines = getCommandNamesAndDescriptions().map(
      (command) => `**/${command.name}** - ${command.description}`,
    );
    const embed = new EmbedBuilder()
      .setColor("DarkOrange")
      .setTitle("Help")
      .setDescription(lines.join("\n"));

    await context.reply({ embeds: [embed] });
  },
};

export default command;
