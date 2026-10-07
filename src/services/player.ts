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
import { createResumableAudioStream } from "../util/resumableFetch";
import { Context } from "../classes/context";
import { createNowPlayingEmbed } from "../util";
import { shuffleArray } from "../util";
import {
  FilterState,
  FilterUpdate,
  buildFilterChain,
  defaultFilterState,
  playbackTempo,
} from "../util/ffmpegFilters";
import { TrackInfo, getPlayableUrl } from "./trackSource";

const players = new Collection<string, PlayerManager>();
const pendingPlayers = new Map<string, Promise<PlayerManager>>();

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

  // Callers arriving while the bot is still joining (e.g. two quick /play's)
  // share that join instead of each creating a player on the same connection
  const pending = pendingPlayers.get(guildId);
  if (pending) return pending;

  const channelId =
    params.context?.member?.voice.channelId ?? params.voiceChannelId;
  if (!channelId) throw new Error("No voice channel id found");

  const creation = createPlayerManager(guildId, channelId, client);
  pendingPlayers.set(guildId, creation);
  try {
    return await creation;
  } finally {
    pendingPlayers.delete(guildId);
  }
}

async function createPlayerManager(
  guildId: string,
  channelId: string,
  client: Client,
) {
  const player = new PlayerManager(guildId, client);
  await player.createPlayer(channelId);
  players.set(guildId, player);
  return player;
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
  private stopping = false;
  private destroyed = false;
  private playGeneration = 0;
  private positionOffsetMs = 0;
  private segmentStartedAt = 0;
  private segmentTempo = 1;
  private pausedAt?: number;

  constructor(guildId: string, client: Client) {
    this.guildId = guildId;
    this.client = client;
    this.audioPlayer = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    // A stream error also triggers the Idle transition below, so this only logs.
    this.audioPlayer.on(AudioPlayerStatus.Idle, () => this.handleIdle());
    // pause() is a no-op until a resource is actually playing, which happens
    // asynchronously after play(). Re-applying it here keeps a restart
    // (seek/filter change/skip) or a /pause during that window from audibly
    // resuming playback. Emitted synchronously, so no audio slips through.
    this.audioPlayer.on(AudioPlayerStatus.Playing, () => {
      if (this.pausedAt) this.audioPlayer.pause();
    });
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
    if (this.stopping || this.destroyed) return;
    this.nextTrack({ sendEmbed: true }).catch((error) =>
      console.error(`[guild ${this.guildId}] Failed to advance the queue:`, error),
    );
  }

  /**
   * Stops playback without the resulting Idle event advancing the queue.
   * stop() emits Idle synchronously (or not at all if already idle), so the
   * flag only has to cover the call itself.
   */
  private stopWithoutAdvancing() {
    // Also cancels a track still resolving its url, so it doesn't start anyway
    this.playGeneration++;
    this.stopping = true;
    this.audioPlayer.stop(true);
    this.stopping = false;
  }

  startMonitoring() {
    // Already counting down (e.g. repeated /skip on an empty queue). Starting
    // another would orphan this timer, which stopMonitoring() could then no
    // longer cancel, disconnecting the bot mid-playback later on.
    if (this.timeoutId) return;
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

    // Also covers connections destroyed from outside destroy(), which would
    // otherwise leave this player's ffmpeg and fetch running
    this.connection.on(VoiceConnectionStatus.Destroyed, () => this.destroy());
  }

  async destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.playGeneration++;
    this.stopMonitoring();
    this.fetchAbort?.abort();
    this.ffmpeg?.destroy();
    this.audioPlayer.stop(true);
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.destroy();
    }
    if (players.get(this.guildId) === this) players.delete(this.guildId);
  }

  /**
   * pausedAt, not the audio player's status, is the source of truth: the
   * player can't report Paused while a new resource is still buffering.
   */
  togglePausePlayer() {
    // Otherwise the pause would silently carry over to whatever plays next
    if (!this.currentTrack) throw new Error("Nothing is playing!");
    if (this.pausedAt) {
      // Shift the segment start forward so getPositionMs() ignores time spent paused
      this.segmentStartedAt += Date.now() - this.pausedAt;
      // Cleared before unpausing, or the Playing listener would pause right back
      this.pausedAt = undefined;
      this.audioPlayer.unpause();
      return false;
    }
    this.pausedAt = Date.now();
    this.audioPlayer.pause();
    return true;
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
    const previousTrack = this.currentTrack;
    if ((!this.currentTrack && this.loop) || !this.loop || options.forceSkip) {
      this.currentTrack = this.queue.shift();
    }
    if (!this.currentTrack) {
      this.stopWithoutAdvancing();
      // Nothing left to resume, so the next /play shouldn't start out paused
      this.pausedAt = undefined;
      this.startMonitoring();
      return;
    }
    this.stopMonitoring();

    // A looping track repeats without being re-announced each time
    if (options.sendEmbed && this.currentTrack !== previousTrack) {
      this.announceNowPlaying(this.currentTrack);
    }

    const track = this.currentTrack;
    try {
      await this.playCurrentTrack(0);
    } catch (error) {
      await this.reportPlaybackFailure(track, error);
      this.currentTrack = undefined;
      await this.nextTrack({ sendEmbed: true });
    }
  }

  private getAnnouncementChannel(track: TrackExt) {
    if (!track.queuedFromChannelId) return undefined;
    const channel = this.client.channels.cache.get(track.queuedFromChannelId) as TextChannel;
    return channel?.isTextBased() ? channel : undefined;
  }

  /**
   * Not awaited: playback shouldn't wait on Discord, and a channel the bot
   * can't post in (slash commands work there regardless) mustn't stop it.
   */
  private announceNowPlaying(track: TrackExt) {
    this.getAnnouncementChannel(track)
      ?.send({ embeds: [createNowPlayingEmbed(track.track)] })
      .catch((error) => console.error("Failed to announce now playing:", error));
  }

  /**
   * Notifies the channel a track was queued from that it couldn't be played.
   * Used both for failures caught synchronously (e.g. resolving the stream
   * url) and ones surfacing later from the ffmpeg/fetch pipeline once
   * playback had already started.
   */
  private async reportPlaybackFailure(track: TrackExt, error: unknown) {
    console.error(`Failed to play "${track.track.title}":`, error);
    await this.getAnnouncementChannel(track)
      ?.send(`⚠️ Couldn't play **${track.track.title}**. Skipping.`)
      .catch((sendError) => console.error("Failed to report playback failure:", sendError));
  }

  /**
   * (Re)starts ffmpeg for the current track at the given position (or, if
   * omitted, wherever playback currently is), applying the current filter
   * state. Used for the initial play, skip, seek and whenever a filter/volume
   * change requires restarting the audio pipeline.
   *
   * The audio bytes are fetched here in Node (not by ffmpeg itself) and piped
   * into ffmpeg's stdin. YouTube's signed stream urls are bound to the IP
   * that requested them; ffmpeg is a separate process with its own network
   * stack, and in a container that can resolve/egress differently than Node
   * does, causing YouTube to 403 a request from a "different" IP for the same
   * url. Fetching in the same process that obtained the url guarantees they
   * match. The tradeoff is that seeking becomes a decode-and-discard instead
   * of an efficient input-side seek, since a piped stream isn't seekable -
   * acceptable for a music bot's typical seek distances.
   */
  private async playCurrentTrack(startMs?: number) {
    if (!this.currentTrack) return;
    const trackAtStart = this.currentTrack;
    const generation = ++this.playGeneration;

    // A newer skip/seek/filter change, a stop or a disconnect may happen while
    // the url resolves. Starting this one anyway would play over it, and its
    // failure no longer matters either.
    let url: string;
    try {
      url = await getPlayableUrl(trackAtStart.track);
    } catch (error) {
      if (generation !== this.playGeneration) return;
      throw error;
    }
    if (generation !== this.playGeneration) return;

    // Taken after resolving the url so the old pipeline's playback during
    // that time isn't replayed
    const positionMs = startMs ?? this.getPositionMs();
    const filterArgs = buildFilterChain(this.filters);

    this.fetchAbort?.abort();
    const fetchAbort = new AbortController();
    this.fetchAbort = fetchAbort;
    const inputStream = createResumableAudioStream(url, fetchAbort.signal);

    const args = [
      "-loglevel",
      "warning",
      "-analyzeduration",
      "0",
      // Before -i so it's measured in track time. As an output option it's
      // applied after the filters, i.e. scaled by any timescale change.
      ...(positionMs > 0 ? ["-ss", (positionMs / 1000).toString()] : []),
      "-i",
      "pipe:0",
      ...(filterArgs.length ? ["-af", filterArgs.join(",")] : []),
      "-ar",
      "48000",
      "-ac",
      "2",
      "-f",
      "opus",
    ];

    this.ffmpeg?.destroy();
    const ffmpeg = new FFmpeg({ args });
    this.ffmpeg = ffmpeg;

    // Fires if the fetch permanently fails (e.g. exhausts its retries) or
    // ffmpeg dies after playback had already started, i.e. too late for the
    // caller's own try/catch. Only act on it if this pipeline is still the
    // current one - an older, already-superseded pipeline (skip/seek/filter
    // change) can still emit a late error after being destroyed.
    const onPlaybackFailure = (error: unknown) => {
      if (generation !== this.playGeneration || this.currentTrack !== trackAtStart) return;
      this.reportPlaybackFailure(trackAtStart, error).catch(() => {});
      this.currentTrack = undefined;
      // A failed fetch leaves ffmpeg waiting on stdin forever, so the player
      // would never reach Idle on its own. Stopping it moves on to the next track.
      fetchAbort.abort();
      ffmpeg.destroy();
      this.audioPlayer.stop(true);
    };

    ffmpeg.on("error", (error) => {
      console.error("ffmpeg error:", error);
      onPlaybackFailure(error);
    });
    ffmpeg.process.stderr?.on("data", (chunk) =>
      console.log(`[guild ${this.guildId}] ffmpeg: ${chunk.toString().trim()}`),
    );
    inputStream.on("error", (error: Error) => {
      console.error("audio fetch stream error:", error);
      onPlaybackFailure(error);
    });
    inputStream.pipe(ffmpeg);

    const resource = createAudioResource(ffmpeg, {
      inputType: StreamType.OggOpus,
    });
    console.log(
      `[guild ${this.guildId}] starting playback of "${trackAtStart.track.title}" at ${positionMs}ms`,
    );

    this.positionOffsetMs = positionMs;
    this.segmentStartedAt = Date.now();
    this.segmentTempo = playbackTempo(this.filters.timescale);
    // Keep the pause clock in sync with the new segment so a later resume
    // (or another restart while still paused) computes the position correctly
    if (this.pausedAt) this.pausedAt = this.segmentStartedAt;

    // If paused, the Playing listener pauses this again as soon as it starts
    this.audioPlayer.play(resource);
  }

  /** Position within the track itself, which only matches wall-clock time at 1x speed */
  private getPositionMs() {
    if (!this.segmentStartedAt) return 0;
    const now = this.pausedAt ?? Date.now();
    return this.positionOffsetMs + (now - this.segmentStartedAt) * this.segmentTempo;
  }

  private async applyFiltersLive() {
    if (!this.currentTrack) return;
    await this.playCurrentTrack();
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
