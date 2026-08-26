import { Client, Guild, Message } from "discord.js";
import { CONDITIONS } from "../interfaces";
import { Context } from "../classes/context";
import { getShoukakuInstance } from "..";
import { getPlayerInstance } from "../services/player";

export const verifyConditions = (params: {
  client: Client;
  guild: Guild | null;
  conditions: CONDITIONS[];
  context: Context;
}): boolean => {
  const { client, guild, conditions, context } = params;
  const shoukaku = getShoukakuInstance();

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

      case CONDITIONS.PlayerExists:
        if (!shoukaku.players.get(guild?.id ?? "")) {
          isOkay = false;
          throw new Error("No player was found for guild!");
        }
        break;

      case CONDITIONS.QueueNotEmpty:
        const playerInstance = getPlayerInstance(guild?.id ?? "");
        if (!playerInstance.getQueue().length) {
          isOkay = false;
          throw new Error("The queue is empty!");
        }
        break;
      default:
        break;
    }
  });
  return isOkay;
};
