import {
  ChatInputCommandInteraction,
  Client,
  GuildMember,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
} from "discord.js";
import { createMessageEmbed } from "../util/messageEmbed";

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
   * has a reply. A plain string gets wrapped in an embed rather than sent as
   * raw message content - some of these messages interpolate text pulled
   * from external sources (track titles, filenames), and Discord parses
   * @everyone/@here/role mentions in message content but never inside embeds.
   */
  async reply(options: ReplyOptions) {
    const payload = typeof options === "string" ? { embeds: [createMessageEmbed(options)] } : options;
    if (this.interaction.deferred) {
      return this.interaction.editReply(payload);
    }
    if (this.interaction.replied) {
      return this.interaction.followUp(payload);
    }
    return this.interaction.reply(payload);
  }
}
