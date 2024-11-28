import { Client, Collection, Message, ReactionUserManager, TextChannel } from "discord.js";
import { Band, ChannelMixSettings, DistortionSettings, FreqSettings, KaraokeSettings, LowPassSettings, Node, Player, RotationSettings, Shoukaku, TimescaleSettings, Track } from "shoukaku";
import { Context } from "../classes/context";
import { createNowPlayingEmbed, shuffleArray } from "../util";

const players = new Collection<string, PlayerManager>();

/**
 * Returns a player that can be used to play tracks from the track queue.
 * @param shoukaku Shoukaku that handles the players
 * @param params different parameters to be used to retrieve necessary information
 * @returns Promise of an instance of player
 */
export async function getPlayer(
  shoukaku: Shoukaku,
  params: {
    voiceChannelId?: string;
    guildId?: string;
    context?: Context;
    noCreate?: boolean;
  }
) {
  const guildId = params.context?.member?.guild.id ?? params.guildId;
  if (!guildId) throw new Error("No guild id found");

  const player = players.get(guildId);
  if (player || params.noCreate) return player;

  const channelId =
    params.context?.member?.voice.channelId ?? params.voiceChannelId;
  if (!channelId) throw new Error("No voice channel id found");

  const newPlayer = params.context?.client ? new PlayerManager(guildId, shoukaku, params.context?.client) : undefined;
  if (!newPlayer)
    throw new Error('Error at player instance creation!');

  try {
    await newPlayer.createPlayer(channelId);
    players.set(guildId, newPlayer);
    return newPlayer;
  } catch (error: any) {
    throw new Error(error.toString());
  }
}

export async function removePlayer(params: {
  guildId?: string;
  context?: Context;
}) {
  const guildId = params.context?.member?.guild.id ?? params.guildId;
  if (!guildId) throw new Error("No guild id found");

  const player = players.get(guildId);
  if (!player) throw new Error("No player found");

  try {
    await player.removePlayer();
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

/**
 * Queues a new track to be played
 * @param track The metadata for the track to be queued
 * @param guildId The id of the guild the track is queued for
 */
export async function queueTrack(
  shoukaku: Shoukaku,
  track: Track,
  context: Context
) {
  const channel = context.channelId;
  if (!channel) throw new Error("No channel id found!");
  const player = await getPlayer(shoukaku, { context });

  player?.queueTrack(new TrackExt(track, channel));
}

class PlayerManager {
  player?: Player;
  private shoukaku: Shoukaku;
  private client: Client;
  private guildId: string;
  private queue: TrackExt[] = [];
  private loop: boolean = false;
  private currentTrack?: TrackExt;
  private timeoutId: NodeJS.Timeout | null = null;
  private timeoutDuration: number = Number.parseInt(process.env.TIMEOUT_DURATION ?? '') ?? 360000;
  private skipping: boolean = false;

  /**
   * Creates a new player manager instance that manages the player that is tied to the node controlling this manager
   * @param guildId The id of the guild the player is created for
   * @param shoukaku The Node that manages this player instance
   */
  constructor(guildId: string, shoukaku: Shoukaku, client: Client) {
    this.guildId = guildId;
    this.shoukaku = shoukaku;
    this.client = client;
  }


  startMonitoring() {
    console.log(`Bot idling on server ${this.guildId}`);
    this.timeoutId = setTimeout(() => {
      if (this.currentTrack === undefined) {
        this.removePlayer()
        console.log(`Bot disconnected due to idle on server ${this.guildId}`);
      }
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
   * Creates a new player for the given guild and joins the defined voice channel
   * @param channelId The voice channel the player is going to join
   */
  async createPlayer(channelId: string) {
    if (this.player) return;
    this.player = await this.shoukaku.joinVoiceChannel({
      guildId: this.guildId,
      channelId,
      shardId: 0, // if unsharded it will always be zero (depending on your library implementation)
    });

    this.player.on("end", (reason) => {
      console.log("Song ended", reason);
      if (this.skipping) return;
      if (this.player) {
        this.player.track = null;
      }
      if (this.queue.length > 0)
        this.nextTrack({ noReplace: true, sendEmbed: true });
    });

    this.player.on('start', (data) => {
      console.log(data.track.info);
    })

    this.player.on("closed", async () => {
      await this.removePlayer();
    });
  }

  async removePlayer() {
    // this.player?.removeAllListeners();
    this.shoukaku.leaveVoiceChannel(this.guildId);
    await this.player?.destroy();
    this.player = undefined;
    players.delete(this.guildId);
  }

  async togglePausePlayer() {
    if (!this.player)
      throw new Error("The player doesn't exist");
    await this.player.setPaused(!this.player.paused);
    return this.player.paused;
  }

  /**
   * Adds a new track into queue and starts playback if queue is empty
   * @param track The metadata for the track to be queued
   */
  async queueTrack(track: TrackExt) {
    this.queue.push(track);
    if (!this.player?.track) await this.nextTrack({ sendEmbed: true });
  }

  toggleLoop() {
    this.loop = !this.loop;
    return this.loop;
  }

  shuffleQueue() {
    this.queue = shuffleArray(this.queue);
    return true;
  }

  async seekSong(target: number) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.seekTo(target);
    return true;
  }

  async skipSong() {
    this.skipping = true;
    await this.nextTrack({ noReplace: false, forceSkip: true, sendEmbed: true });
    this.skipping = false;
  }

  async nextTrack(options: { noReplace?: boolean, forceSkip?: boolean, sendEmbed?: boolean }) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    if ((!this.currentTrack && this.loop) || !this.loop || options.forceSkip)
      this.currentTrack = this.queue.shift();
    if (!this.currentTrack) {
      await this.player.stopTrack();
      this.startMonitoring();
      return;
    }
    this.stopMonitoring();
    if (this.currentTrack.queuedFromChannelId && options.sendEmbed) {
      const channel = this.client.channels.cache.get(this.currentTrack.queuedFromChannelId) as TextChannel;
      if (channel?.isTextBased()) {
        const embed = createNowPlayingEmbed(this.currentTrack.track);
        await channel.send({ embeds: [embed] });
      }
    }
    await this.player.playTrack({
      track: { encoded: this.currentTrack.track.encoded },
    },
      options.noReplace ?? false,
    );
    return this.currentTrack;
  }

  getQueue() {
    return this.queue;
  }

  async setTimescale(value: TimescaleSettings) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setTimescale(value);
  }

  async setVolume(value: number) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setFilterVolume(value);
  }

  async setEqualizer(value: Band[]) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setEqualizer(value);
  }

  async setKaraoke(value: KaraokeSettings) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setKaraoke(value);
  }

  async setTremolo(value: FreqSettings) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setTremolo(value);
  }

  async setVibrato(value: FreqSettings) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setVibrato(value);
  }

  async setDistortion(value: DistortionSettings) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setDistortion(value);
  }

  async setRotation(value: RotationSettings) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setRotation(value);
  }

  async setChannelMix(value: ChannelMixSettings) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setChannelMix(value);
  }

  async setLowPass(value: LowPassSettings) {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.setLowPass(value);
  }

  async clearFilters() {
    if (!this.player) {
      throw new Error("The player doesn't exist");
    }
    await this.player.clearFilters();
  }
}

export class TrackExt {
  track: Track;
  queuedFromChannelId?: string;

  /**
 * Creates a new extended Track instance that adds additional information alongside the track
 * @param track The track itself
 * @param queuedFromChannelId Optional field that contains a channel id where the track was queued from
 */
  constructor(track: Track, queuedFromChannelId?: string) {
    this.track = track;
    this.queuedFromChannelId = queuedFromChannelId;
  }
}
