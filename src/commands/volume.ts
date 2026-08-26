import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Adjust the player volume")
    .addNumberOption((option) =>
      option
        .setName("volume")
        .setDescription("The volume value as %")
        .setMinValue(0)
        .setMaxValue(500)
        .setRequired(true),
    ),
  conditions: [CONDITIONS.SameVoice],
  execute: async (context, interaction) => {
    const player = await getPlayer(context.client, { context, noCreate: true });
    if (!player) {
      await context.reply("I am not connected to any voice channels!");
      return;
    }

    const volume = interaction.options.getNumber("volume", true);
    const embed = new EmbedBuilder()
      .setColor("DarkRed")
      .setTitle("Volume")
      .setDescription(`${volume}%`);

    await context.reply({ embeds: [embed] });
    await player.setFilters({ volume: volume / 100 });
  },
};

export default command;
