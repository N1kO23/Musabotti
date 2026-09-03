import {
  AudioPlayer,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} from "@discordjs/voice";
import { Client, Collection, TextChannel } from "discord.js";
import { FFmpeg } from "prism-media";
import { Context } from "../classes/context";
import { createNowPlayingEmbed } from "../util";
import { shuffleArray } from "../util";
import {
  FilterState,
  FilterUpdate,
  buildFilterChain,
  defaultFilterState,
} from "../util/ffmpegFilters";
import { TrackInfo, getPlayableStream } from "./trackSource";

const players = new Collection<string, PlayerManager>();

export class TrackExt {
  track: TrackInfo;
  queuedFromChannelId?: string;

  constructor(track: TrackInfo, queuedFromChannelId?: string) {
    this.track = track;
    this.queuedFromChannelId = queuedFromChannelId;
  }
}

/**
 * Returns a player that can be used to play tracks from the track queue.
 */
export async function getPlayer(
  client: Client,
  params: {
    voiceChannelId?: string;
    guildId?: string;
    context?: Context;
    noCreate?: boolean;
  },
) {
  const guildId = params.context?.guildId ?? params.guildId;
  if (!guildId) throw new Error("No guild id found");

  const player = players.get(guildId);
  if (player || params.noCreate) return player;

  const channelId =
    params.context?.member?.voice.channelId ?? params.voiceChannelId;
  if (!channelId) throw new Error("No voice channel id found");

  const newPlayer = new PlayerManager(guildId, client);

  try {
    await newPlayer.createPlayer(channelId);
    players.set(guildId, newPlayer);
    return newPlayer;
  } catch (error: any) {
    throw new Error(error.toString());
  }
}

export const hasPlayer = (guildId: string) => players.has(guildId);

export const getPlayerInstance = (guildId: string) => {
  const player = players.get(guildId);
  if (!player) throw new Error("No player found for the given guild id");
  return player;
};

export async function removePlayer(params: {
  guildId?: string;
  context?: Context;
}) {
  const guildId = params.context?.guildId ?? params.guildId;
  if (!guildId) throw new Error("No guild id found");

  const player = players.get(guildId);
  if (!player) throw new Error("No player found");

  try {
    await player.destroy();
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

/**
 * Queues a new track to be played
 */
export async function queueTrack(
  client: Client,
  track: TrackInfo,
  context: Context,
) {
  const player = await getPlayer(client, { context });
  await player?.queueTrack(new TrackExt(track, context.channelId));
}

class PlayerManager {
  private connection?: VoiceConnection;
  private audioPlayer: AudioPlayer;
  private client: Client;
  private guildId: string;
  private queue: TrackExt[] = [];
  private loop = false;
  private currentTrack?: TrackExt;
  private timeoutId: NodeJS.Timeout | null = null;
  private timeoutDuration = Number.parseInt(
    process.env.TIMEOUT_DURATION ?? "30000",
    10,
  );
  private filters: FilterState = defaultFilterState();
  private ffmpeg?: FFmpeg;
  private fetchAbort?: AbortController;
  private restarting = false;
  private positionOffsetMs = 0;
  private segmentStartedAt = 0;
  private pausedAt?: number;

  constructor(guildId: string, client: Client) {
    this.guildId = guildId;
    this.client = client;
    this.audioPlayer = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    // A stream error also triggers the Idle transition below, so this only logs.
    this.audioPlayer.on(AudioPlayerStatus.Idle, () => this.handleIdle());
    this.audioPlayer.on("error", (error) => {
      console.error("Audio player error:", error);
    });
    this.audioPlayer.on("stateChange", (oldState, newState) => {
      console.log(
        `[guild ${this.guildId}] audio player ${oldState.status} -> ${newState.status}` +
          (oldState.status !== AudioPlayerStatus.Idle
            ? ` (playbackDuration: ${(oldState as any).playbackDuration ?? "n/a"}ms)`
            : ""),
      );
    });
  }

  private handleIdle() {
    if (this.restarting) {
      this.restarting = false;
      return;
    }
    this.nextTrack({ sendEmbed: true });
  }

  startMonitoring() {
    console.log(`Bot idling on server ${this.guildId}`);
    this.timeoutId = setTimeout(() => {
      console.log("Idle finished.. Where we at??");
      this.destroy();
      console.log(`Bot disconnected due to idle on server ${this.guildId}`);
    }, this.timeoutDuration);
  }

  stopMonitoring() {
    if (this.timeoutId) {
      console.log(`Bot resumed from idle on server ${this.guildId}`);
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Creates a new voice connection for the given guild and joins the defined voice channel
   */
  async createPlayer(channelId: string) {
    if (this.connection) return;
    console.log(
      `Creating player for guild ${this.guildId} in channel ${channelId}`,
    );

    const guild = await this.client.guilds.fetch(this.guildId);
    this.connection = joinVoiceChannel({
      guildId: this.guildId,
      channelId,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.connection.subscribe(this.audioPlayer);

    try {
      await entersState(this.connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      this.connection.destroy();
      this.connection = undefined;
      throw new Error("Failed to join the voice channel in time");
    }

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection!, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.connection!, VoiceConnectionStatus.Connecting, 5000),
        ]);
      } catch {
        this.destroy();
      }
    });

    this.connection.on(VoiceConnectionStatus.Destroyed, () => {
      players.delete(this.guildId);
    });
  }

  async destroy() {
    this.stopMonitoring();
    this.restarting = true;
    this.fetchAbort?.abort();
    this.ffmpeg?.destroy();
    this.audioPlayer.stop(true);
    this.connection?.destroy();
    players.delete(this.guildId);
  }

  togglePausePlayer() {
    const paused = this.audioPlayer.state.status === AudioPlayerStatus.Paused;
    if (paused) {
      this.audioPlayer.unpause();
      if (this.pausedAt) {
        // Shift the segment start forward so getPositionMs() ignores time spent paused
        this.segmentStartedAt += Date.now() - this.pausedAt;
        this.pausedAt = undefined;
      }
    } else {
      this.audioPlayer.pause();
      this.pausedAt = Date.now();
    }
    return !paused;
  }

  /**
   * Adds a new track into the queue and starts playback if the queue was empty
   */
  async queueTrack(track: TrackExt) {
    this.queue.push(track);
    if (!this.currentTrack) await this.nextTrack({ sendEmbed: true });
  }

  toggleLoop() {
    this.loop = !this.loop;
    return this.loop;
  }

  shuffleQueue() {
    this.queue = shuffleArray(this.queue);
    return true;
  }

  async seekSong(targetMs: number) {
    if (!this.currentTrack) throw new Error("Nothing is playing");
    await this.playCurrentTrack(targetMs);
    return true;
  }

  async skipSong() {
    await this.nextTrack({ forceSkip: true, sendEmbed: true });
  }

  private async nextTrack(options: {
    forceSkip?: boolean;
    sendEmbed?: boolean;
  }) {
    if ((!this.currentTrack && this.loop) || !this.loop || options.forceSkip) {
      this.currentTrack = this.queue.shift();
    }
    if (!this.currentTrack) {
      this.restarting = true;
      this.audioPlayer.stop(true);
      this.startMonitoring();
      return;
    }
    this.stopMonitoring();

    if (this.currentTrack.queuedFromChannelId && options.sendEmbed) {
      const channel = this.client.channels.cache.get(
        this.currentTrack.queuedFromChannelId,
      ) as TextChannel;
      if (channel?.isTextBased()) {
        const embed = createNowPlayingEmbed(this.currentTrack.track);
        await channel.send({ embeds: [embed] });
      }
    }

    try {
      await this.playCurrentTrack(0);
    } catch (error) {
      await this.reportPlaybackFailure(this.currentTrack, error);
      this.currentTrack = undefined;
      await this.nextTrack({ sendEmbed: true });
    }
  }

  /**
   * Notifies the channel a track was queued from that it couldn't be played.
   * Used both for failures caught synchronously (e.g. resolving the stream
   * url) and ones surfacing later from the ffmpeg/fetch pipeline once
   * playback had already started.
   */
  private async reportPlaybackFailure(track: TrackExt, error: unknown) {
    console.error(`Failed to play "${track.track.title}":`, error);
    if (!track.queuedFromChannelId) return;
    const channel = this.client.channels.cache.get(track.queuedFromChannelId) as TextChannel;
    if (!channel?.isTextBased()) return;
    await channel
      .send(`⚠️ Couldn't play **${track.track.title}**. Skipping.`)
      .catch((sendError) => console.error("Failed to report playback failure:", sendError));
  }

  /**
   * (Re)starts ffmpeg for the current track at the given position, applying
   * the current filter state. Used for the initial play, skip, seek and
   * whenever a filter/volume change requires restarting the audio pipeline.
   *
   * Each source decides for itself how to actually fetch the audio (see
   * trackSource.getPlayableStream) - this just pipes whatever stream it gets
   * into ffmpeg's stdin. The tradeoff is that seeking becomes a decode-and-
   * discard (-ss after -i) instead of an efficient input-side seek, since a
   * piped stream isn't seekable - acceptable for a music bot's typical seek
   * distances.
   */
  private async playCurrentTrack(startMs: number) {
    if (!this.currentTrack) return;
    const trackAtStart = this.currentTrack;

    this.fetchAbort?.abort();
    this.fetchAbort = new AbortController();
    const inputStream = await getPlayableStream(this.currentTrack.track, this.fetchAbort.signal);
    const filterArgs = buildFilterChain(this.filters);

    // Fires if the fetch permanently fails (e.g. exhausts its retries) after
    // playback had already started, i.e. too late for the caller's own
    // try/catch. Only act on it if this is still the track actually playing -
    // an older, already-superseded pipeline (skip/seek/filter change) can
    // still emit a late error after being destroyed. Guarded against firing
    // twice for the same attempt (e.g. both the fetch and ffmpeg erroring).
    let failureHandled = false;
    const onPlaybackFailure = (error: unknown) => {
      if (failureHandled || this.currentTrack !== trackAtStart) return;
      failureHandled = true;
      this.reportPlaybackFailure(trackAtStart, error).catch(() => {});
      this.currentTrack = undefined;
    };

    const args = [
      "-loglevel",
      "warning",
      "-analyzeduration",
      "0",
      "-i",
      "pipe:0",
      ...(startMs > 0 ? ["-ss", (startMs / 1000).toString()] : []),
      ...(filterArgs.length ? ["-af", filterArgs.join(",")] : []),
      "-ar",
      "48000",
      "-ac",
      "2",
      "-f",
      "opus",
    ];

    this.ffmpeg?.destroy();
    this.ffmpeg = new FFmpeg({ args });
    this.ffmpeg.on("error", (error) => {
      console.error("ffmpeg error:", error);
      onPlaybackFailure(error);
    });
    this.ffmpeg.process.stderr?.on("data", (chunk) =>
      console.log(`[guild ${this.guildId}] ffmpeg: ${chunk.toString().trim()}`),
    );
    inputStream.on("error", (error: Error) => {
      console.error("audio fetch stream error:", error);
      onPlaybackFailure(error);
    });
    inputStream.pipe(this.ffmpeg);

    const resource = createAudioResource(this.ffmpeg, {
      inputType: StreamType.OggOpus,
    });
    console.log(
      `[guild ${this.guildId}] starting playback of "${this.currentTrack.track.title}" at ${startMs}ms`,
    );

    this.positionOffsetMs = startMs;
    this.segmentStartedAt = Date.now();
    // Keep the pause clock in sync with the new segment so a later resume
    // (or another restart while still paused) computes the position correctly
    if (this.pausedAt) this.pausedAt = this.segmentStartedAt;

    this.audioPlayer.play(resource);
    // Restarting the pipeline (e.g. for a filter change) must not un-pause playback
    if (this.pausedAt) this.audioPlayer.pause();
  }

  private getPositionMs() {
    if (!this.segmentStartedAt) return 0;
    const now = this.pausedAt ?? Date.now();
    return this.positionOffsetMs + (now - this.segmentStartedAt);
  }

  private async applyFiltersLive() {
    if (!this.currentTrack) return;
    await this.playCurrentTrack(this.getPositionMs());
  }

  getQueue() {
    return this.queue;
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  /**
   * Applies one or more filter changes in a single ffmpeg pipeline restart.
   * Fields are merged onto the existing filter state; only what's passed changes.
   */
  async setFilters(update: FilterUpdate) {
    if (update.volume !== undefined) this.filters.volume = update.volume;

    if (update.timescale) {
      const defined = Object.fromEntries(
        Object.entries(update.timescale).filter(([, v]) => v !== undefined),
      );
      this.filters.timescale = { ...this.filters.timescale, ...defined };
    }

    if (update.equalizerBands) {
      const equalizer = new Array(15).fill(0);
      update.equalizerBands.forEach(({ band, gain }) => {
        if (band >= 0 && band < equalizer.length) equalizer[band] = gain;
      });
      this.filters.equalizer = equalizer;
    }

    if (update.tremolo) this.filters.tremolo = update.tremolo;
    if (update.vibrato) this.filters.vibrato = update.vibrato;
    if (update.lowPass) this.filters.lowPass = update.lowPass;
    if (update.distortion !== undefined) this.filters.distortion = update.distortion;

    await this.applyFiltersLive();
  }

  async clearFilters() {
    this.filters = defaultFilterState();
    await this.applyFiltersLive();
  }

  getGuildId() {
    return this.guildId;
  }
}
