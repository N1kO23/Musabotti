import { SlashCommandBuilder } from "discord.js";
import { ICommand } from "../interfaces";
import { queueTrack } from "../services/player";
import { resolve, resolveAttachment } from "../services/trackSource";
import { createEmbed, createPlaylistEmbed } from "../util";

const AUDIO_FILE_EXT_RE = /\.(mp3|wav|ogg|oga|m4a|flac|opus|aac|webm|wma)$/i;

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song, a SoundCloud link, or an audio file")
    .addStringOption((option) =>
      option
        .setName("song")
        .setDescription("Song name, YouTube/SoundCloud url, audio file url, or 'scsearch:query'")
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
        result = await resolve(query!);
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
      await context.reply({ embeds: [createPlaylistEmbed(result.tracks)] });
    } else {
      const [track] = result.tracks;
      await context.reply({ embeds: [createEmbed(track)] });
      await queueTrack(context.client, track, context);
    }
  },
};

export default command;
