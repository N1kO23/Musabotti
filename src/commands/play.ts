import { ApplicationCommandOptionChoiceData, SlashCommandBuilder } from "discord.js";
import { ICommand } from "../interfaces";
import { queueTrack } from "../services/player";
import { resolve, resolveAttachment, searchSuggestions } from "../services/trackSource";
import {
  createEmbed,
  createPlaylistEmbed,
  timeConvert2,
  truncateString,
  withTimeout,
} from "../util";

const AUDIO_FILE_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|flac|opus|aac|webm|wma)$/i;
const RESOLVE_TIMEOUT_MS = 20_000;

const SUGGESTION_LIMIT = 5;
const SUGGESTION_MIN_QUERY_LENGTH = 3;
// Discord discards autocomplete responses that take longer than 3s
const SUGGESTION_TIMEOUT_MS = 2500;
const SUGGESTION_CACHE_SIZE = 100;
// Discord caps both a choice's label and its value at 100 characters
const CHOICE_MAX_LENGTH = 100;

// Typing sends a request per keystroke, often repeating earlier queries
const suggestionCache = new Map<string, ApplicationCommandOptionChoiceData<string>[]>();

async function getSuggestions(query: string) {
  const key = query.toLowerCase();
  const cached = suggestionCache.get(key);
  if (cached) return cached;

  const tracks = await withTimeout(
    searchSuggestions(query, SUGGESTION_LIMIT),
    SUGGESTION_TIMEOUT_MS,
  );
  const choices = tracks
    .filter((track) => track.url.length <= CHOICE_MAX_LENGTH)
    .map((track) => {
      const length = track.isLive ? "live" : timeConvert2(track.durationMs);
      return {
        name: truncateString(`${track.title} - ${track.author} (${length})`, CHOICE_MAX_LENGTH),
        value: track.url,
      };
    });

  if (suggestionCache.size >= SUGGESTION_CACHE_SIZE) {
    suggestionCache.delete(suggestionCache.keys().next().value!);
  }
  suggestionCache.set(key, choices);
  return choices;
}

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song, a SoundCloud link, or an audio file")
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription("Song name, YouTube/SoundCloud/Spotify url, audio file url, or 'scsearch:query'")
        .setAutocomplete(true)
        .setRequired(false),
    )
    .addAttachmentOption((option) =>
      option
        .setName("file")
        .setDescription("An audio file to play directly")
        .setRequired(false),
    ),
  conditions: [],
  execute: async (context, interaction) => {
    const query = interaction.options.getString("song");
    const file = interaction.options.getAttachment("file");

    if (!query && !file) {
      await context.reply("Give me a song name/url, or attach an audio file!");
      return;
    }

    if (!context.member?.voice.channelId) {
      await context.reply("You need to be in a voice channel to play music!");
      return;
    }

    await context.interaction.deferReply();

    let result;
    try {
      if (file) {
        const isAudio =
          file.contentType?.startsWith("audio/") || AUDIO_FILE_EXT_RE.test(file.name);
        if (!isAudio) {
          await context.reply("That attachment doesn't look like an audio file!");
          return;
        }
        result = await resolveAttachment(file.url, file.name);
      } else {
        result = await withTimeout(resolve(query!), RESOLVE_TIMEOUT_MS);
      }
    } catch (error: any) {
      console.error(`Failed to resolve "${query ?? file?.url}":`, error);
      await context.reply(error?.message ?? "The song was not found");
      return;
    }

    if (result.isPlaylist) {
      for (const track of result.tracks) {
        await queueTrack(context.client, track, context);
      }
      const embed = createPlaylistEmbed(result.tracks);
      if (result.notice) embed.setFooter({ text: result.notice });
      await context.reply({ embeds: [embed] });
    } else {
      const [track] = result.tracks;
      await context.reply({ embeds: [createEmbed(track)] });
      await queueTrack(context.client, track, context);
    }
  },
  autocomplete: async (interaction) => {
    const query = interaction.options.getFocused().trim();
    // Links, Spotify URIs and SoundCloud searches go through as typed
    if (
      query.length < SUGGESTION_MIN_QUERY_LENGTH ||
      /^(https?:\/\/|spotify:|scsearch:)/i.test(query)
    ) {
      await interaction.respond([]);
      return;
    }

    let choices: ApplicationCommandOptionChoiceData<string>[] = [];
    try {
      choices = await getSuggestions(query);
    } catch (error) {
      console.error(`Failed to get suggestions for "${query}":`, error);
    }
    await interaction.respond(choices);
  },
};

export default command;
