import { CONDITIONS } from "../interfaces";
import { Context } from "../classes/context";
import { getPlayerInstance, hasPlayer } from "../services/player";

export const verifyConditions = (
  conditions: CONDITIONS[],
  context: Context,
) => {
  conditions.forEach((cond) => {
    switch (cond) {
      case CONDITIONS.SameVoice: {
        const me = context.interaction.guild?.members.me;
        const memberChannelId = context.member?.voice.channelId;
        if (
          !memberChannelId ||
          !me?.voice.channelId ||
          memberChannelId !== me.voice.channelId
        ) {
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
