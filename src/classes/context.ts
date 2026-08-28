import {
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
} from "discord.js";

type ReplyOptions = string | (InteractionReplyOptions & InteractionEditReplyOptions);

export class Context {
  client: Client;
  interaction: ChatInputCommandInteraction;
  guildId: string;
  channelId: string;
  member: GuildMember | null;

  constructor(interaction: ChatInputCommandInteraction) {
    this.client = interaction.client;
    this.interaction = interaction;
    this.guildId = interaction.guildId ?? "";
    this.channelId = interaction.channelId;
    this.member =
      interaction.member instanceof GuildMember
        ? interaction.member
        : (interaction.guild?.members.cache.get(interaction.user.id) ?? null);
  }

  /**
   * Replies to the interaction, filling in the "thinking..." placeholder left
   * by deferReply() if one is pending, or sending a follow-up if it already
   * has a reply.
   */
  async reply(options: ReplyOptions) {
    if (this.interaction.deferred) {
      return this.interaction.editReply(options);
    }
    if (this.interaction.replied) {
      return this.interaction.followUp(options);
    }
    return this.interaction.reply(options);
  }
}
