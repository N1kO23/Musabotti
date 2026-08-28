import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("bassboost")
    .setDescription(
      "Sets equalizer to be bass boosted, will override the existing eq settings",
    )
    .addNumberOption((option) =>
      option
        .setName("magnitude")
        .setDescription("The bass boosting magnitude")
        .setRequired(false),
    ),
  conditions: [CONDITIONS.SameVoice],
  execute: async (context, interaction) => {
    const player = await getPlayer(context.client, { context, noCreate: true });
    if (!player) {
      await context.reply("I am not connected to any voice channels!");
      return;
    }

    const magnitude = interaction.options.getNumber("magnitude") ?? 1;

    const embed = new EmbedBuilder()
      .setColor("DarkRed")
      .setTitle("Bassboost")
      .addFields({ name: "Magnitude", value: magnitude.toString() });

    const bassboostEq = [
      { band: 0, gain: 0.8 * magnitude },
      { band: 1, gain: 0.3 * magnitude },
      { band: 2, gain: 0.2 * magnitude },
    ];

    await context.reply({ embeds: [embed] });
    await player.setFilters({ equalizerBands: bassboostEq });
  },
};

export default command;
