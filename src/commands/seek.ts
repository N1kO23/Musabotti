import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayer } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Seeks to desired time of the song")
    .addNumberOption((option) =>
      option
        .setName("timestamp")
        .setDescription("The timestamp to jump to in seconds (can do decimal accuracy)")
        .setRequired(true),
    ),
  conditions: [CONDITIONS.SameVoice],
  execute: async (context, interaction) => {
    const player = await getPlayer(context.client, { context, noCreate: true });
    if (!player) {
      await context.reply("I am not connected to any voice channels!");
      return;
    }

    const timestamp = interaction.options.getNumber("timestamp", true);
    const targetMs = timestamp * 1000;

    const embed = new EmbedBuilder()
      .setColor("DarkBlue")
      .setTitle("Seek")
      .addFields({ name: "Timestamp", value: targetMs.toString() });

    await context.reply({ embeds: [embed] });
    await player.seekSong(targetMs);
  },
};

export default command;
