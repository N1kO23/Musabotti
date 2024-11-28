import {
  APIInteractionGuildMember,
  CacheType,
  ChannelType,
  Client,
  Guild,
  GuildMember,
  Interaction,
  InteractionResponse,
  Message,
  MessagePayload,
  MessageReplyOptions,
} from "discord.js";
import { IContext } from "../interfaces";

export class Context implements IContext {
  client: Client;
  guildId: string | null;
  channelId: string | null;
  member: GuildMember | null;
  message?: Message;
  interaction?: Interaction<CacheType>;

  constructor(params: {
    client: Client;
    guildId: string | null;
    channelId: string | null;
    member: GuildMember | APIInteractionGuildMember | null;
    message?: Message;
    interaction?: Interaction;
  }) {
    const { client, guildId, channelId, member, message, interaction } = params;
    this.client = client;
    this.guildId = guildId;
    this.channelId = channelId;
    this.message = message;
    this.interaction = interaction;

    const guild = this.client.guilds.cache.get(guildId ?? "");
    this.member =
      guild?.members.cache.get(member?.user.id ?? "") ??
      (member as GuildMember);
  }

  async reply(
    options: any
  ): Promise<Message<boolean> | InteractionResponse<boolean>> {
    if (this.message) {
      return this.message.reply(options);
    } else if (this.interaction && this.interaction.isChatInputCommand()) {
      return this.interaction.reply(options);
    } else {
      throw new Error(`Invalid reply command`);
    }
  }
}
