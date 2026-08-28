import { SlashCommandBuilder } from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { removePlayer } from "../services/player";

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("disconnect")
    .setDescription("Disconnects from the voice chat"),
  conditions: [CONDITIONS.SameVoice],
  execute: async (context) => {
    const channelName = context.member?.voice.channel?.name;
    const ok = await removePlayer({ context });
    await context.reply(ok ? `I left chat ${channelName}` : "Lol no");
  },
};

export default command;
