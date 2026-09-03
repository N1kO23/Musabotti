import { EmbedBuilder } from "discord.js";

/**
 * Wraps a plain status/error message in an embed instead of sending it as
 * raw message content. Track titles, filenames, and similar text pulled from
 * external sources (YouTube, SoundCloud, uploaded files) end up interpolated
 * into some of these messages, and Discord parses @everyone/@here/role
 * mentions in plain message content - but never inside embed fields - so
 * this is what actually closes that off, not just a style choice.
 */
export const createMessageEmbed = (message: string) =>
  new EmbedBuilder().setColor("Blurple").setDescription(message);
