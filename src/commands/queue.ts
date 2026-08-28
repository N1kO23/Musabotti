import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { ICommand } from "../interfaces";
import { getPlayer } from "../services/player";
import { timeConvert } from "../util";

const ZERO_WIDTH_SPACE = "​";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Shows the music queue"),
  conditions: [],
  execute: async (context) => {
    const player = await getPlayer(context.client, { context, noCreate: true });
    if (!player) {
      await context.reply("I ain't in a voice channel");
      return;
    }

    const embed = new EmbedBuilder().setColor("DarkGreen").setTitle("Queue");
    const queue = player.getQueue().slice(0, 5);
    queue.forEach((track) => {
      embed.addFields(
        { inline: true, name: track.track.title, value: track.track.author },
        {
          inline: true,
          name: "Length",
          value: track.track.isLive
            ? "🔴 Live"
            : timeConvert(track.track.durationMs),
        },
      );
      embed.addFields({ name: ZERO_WIDTH_SPACE, value: ZERO_WIDTH_SPACE, inline: false });
    });

    await context.reply({ embeds: [embed] });
  },
};

export default command;
