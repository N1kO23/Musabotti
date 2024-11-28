import { Client, Guild, Message } from "discord.js";
import { CONDITIONS } from "../interfaces";
import { Context } from "../classes/context";

export const verifyConditions = (params: {
  client: Client;
  guild: Guild | null;
  conditions: CONDITIONS[];
  context: Context;
}): boolean => {
  const { client, guild, conditions, context } = params;
  let isOkay = true;
  conditions.forEach((cond) => {
    switch (cond) {
      case CONDITIONS.SameVoice:
        const me = guild?.members.cache.get(client.user?.id ?? "");
        if (
          !(
            context.member?.voice?.channelId &&
            me?.voice.channelId &&
            context.member.voice.channelId === me.voice.channelId
          )
        ) {
          isOkay = false;
          throw new Error("You are not in same voice channel as the bot!");
        }
        break;

      default:
        break;
    }
  });
  return isOkay;
};
