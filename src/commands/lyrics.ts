import { EmbedBuilder, SlashCommandBuilder, escapeMarkdown } from "discord.js";
import { ICommand } from "../interfaces";
import { findPlayer } from "../services/player";
import { Lyrics, findLyrics, searchLyrics } from "../services/lyricsSource";
import { formatTitle, replyWithPages, truncateString } from "../util";

// Embed descriptions cap out at 4096 characters; this leaves room for escaping
const PAGE_LENGTH = 3500;

/** Splits lyrics into pages, between verses where possible */
function toPages(text: string): string[] {
  const pages: string[] = [];
  let page = "";
  for (const verse of escapeMarkdown(text).split(/\n\s*\n/)) {
    // A single verse longer than a page gets split between its lines instead
    const pieces = verse.length > PAGE_LENGTH ? verse.split("\n") : [verse];
    for (const piece of pieces) {
      const separator = pieces.length > 1 ? "\n" : "\n\n";
      if (page && page.length + separator.length + piece.length > PAGE_LENGTH) {
        pages.push(page);
        page = "";
      }
      page = page ? page + separator + piece : piece;
    }
  }
  if (page) pages.push(page);
  return pages;
}

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("lyrics")
    .setDescription("Shows the lyrics of the current song, or of any song you name")
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription("A song to look up instead, e.g. Fleetwood Mac Dreams")
        .setRequired(false),
    ),
  conditions: [],
  execute: async (context, interaction) => {
    const query = interaction.options.getString("song");
    const current = query ? undefined : findPlayer(context.guildId)?.getCurrentTrack();
    if (!query && !current) {
      await context.reply("Nothing is playing - name a song instead, e.g. /lyrics song:Fleetwood Mac Dreams");
      return;
    }

    await interaction.deferReply();
    let lyrics: Lyrics | undefined;
    if (query) lyrics = await searchLyrics(query);
    else lyrics = await findLyrics(current!.track);
    const asked = query ? `"${escapeMarkdown(query)}"` : formatTitle(current!.track);

    if (!lyrics) {
      await context.reply(`Couldn't find lyrics for ${asked}`);
      return;
    }
    if (!lyrics.plain) {
      await context.reply(
        lyrics.instrumental
          ? `🎹 ${asked} is instrumental, there are no lyrics to show`
          : `Couldn't find lyrics for ${asked}`,
      );
      return;
    }

    const pages = toPages(lyrics.plain);
    const found = lyrics;
    await replyWithPages(
      interaction,
      (page) =>
        new EmbedBuilder()
          .setColor("#1db954")
          .setAuthor({ name: truncateString(found.artistName, 256) })
          .setTitle(truncateString(`🎤 ${found.trackName}`, 256))
          .setDescription(pages[page])
          .setFooter({
            text: `Lyrics from LRCLIB${pages.length > 1 ? ` · Page ${page + 1}/${pages.length}` : ""}`,
          }),
      () => pages.length,
    );
  },
};

export default command;
