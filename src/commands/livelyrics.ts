import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("livelyrics")
    .setDescription("Follows each song's lyrics line by line as it plays")
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription("Turn live lyrics on or off - leave empty to toggle")
        .setRequired(false),
    ),
  conditions: [CONDITIONS.SameVoice, CONDITIONS.PlayerExists],
  execute: async (context, interaction) => {
    const player = getPlayerInstance(context.guildId);
    const chosen = interaction.options.getBoolean("enabled");
    if (chosen === null) player.toggleLiveLyrics();
    else player.setLiveLyrics(chosen);
    await context.reply(
      player.isLiveLyricsOn()
        ? "🎤 Live lyrics are on: each song gets a message that follows its lyrics as it plays"
        : "🎤 Live lyrics are off",
    );
  },
};

export default command;
