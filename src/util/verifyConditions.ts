import { Guild, GuildMember } from "discord.js";
import { CONDITIONS } from "../interfaces";
import { Context } from "../classes/context";
import { getPlayerInstance, hasPlayer } from "../services/player";

/** Whether someone is listening in the voice channel the bot is in */
export const isInBotVoiceChannel = (
  member: GuildMember | null | undefined,
  guild: Guild | null,
) => {
  const botChannelId = guild?.members.me?.voice.channelId;
  return Boolean(botChannelId && member?.voice.channelId === botChannelId);
};

export const verifyConditions = (
  conditions: CONDITIONS[],
  context: Context,
) => {
  conditions.forEach((cond) => {
    switch (cond) {
      case CONDITIONS.SameVoice: {
        if (!isInBotVoiceChannel(context.member, context.interaction.guild)) {
          throw new Error("You are not in the same voice channel as the bot!");
        }
        break;
      }

      case CONDITIONS.PlayerExists: {
        if (!hasPlayer(context.guildId)) {
          throw new Error("I am not connected to any voice channels!");
        }
        break;
      }

      case CONDITIONS.QueueNotEmpty: {
        const player = getPlayerInstance(context.guildId);
        if (player.getQueue().length === 0) {
          throw new Error("The queue is empty!");
        }
        break;
      }

      default:
        break;
    }
  });
};
