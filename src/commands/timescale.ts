import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("timescale")
    .setDescription("Sets the time scale of the player")
    .addNumberOption((option) =>
      option.setName("speed").setDescription("The song speed").setRequired(false),
    )
    .addNumberOption((option) =>
      option.setName("pitch").setDescription("The song pitch").setRequired(false),
    )
    .addNumberOption((option) =>
      option.setName("rate").setDescription("The song rate").setRequired(false),
    ),
  conditions: [CONDITIONS.SameVoice],
  execute: async (context, interaction) => {
    const player = await getPlayer(context.client, { context, noCreate: true });
    if (!player) {
      await context.reply("I am not connected to any voice channels!");
      return;
    }

    const speed = interaction.options.getNumber("speed") ?? undefined;
    const pitch = interaction.options.getNumber("pitch") ?? undefined;
    const rate = interaction.options.getNumber("rate") ?? undefined;

    const embed = new EmbedBuilder().setColor("DarkRed").setTitle("Timescale");
    embed.addFields({ name: "Speed", value: speed?.toString() ?? "default" });
    embed.addFields({ name: "Pitch", value: pitch?.toString() ?? "default" });
    embed.addFields({ name: "Rate", value: rate?.toString() ?? "default" });

    await context.reply({ embeds: [embed] });
    await player.setFilters({ timescale: { speed, pitch, rate } });
  },
};

export default command;
