import { ButtonInteraction, EmbedBuilder, GuildMember, MessageFlags } from "discord.js";
import { showQueue } from "../commands/queue";
import { LoopMode, findPlayer } from "../services/player";
import {
  PLAYER_CONTROL_PREFIX,
  PlayerControl,
  createMessageEmbed,
  createPlayerControls,
  isInBotVoiceChannel,
} from "../util";

// How far ⏪ and ⏩ jump
const SEEK_STEP_MS = 10_000;

const LOOP_NOTES: Record<LoopMode, string> = {
  off: "➡️ Loop turned off",
  track: "🔂 Now looping the song",
  queue: "🔁 Now looping the queue",
};

const privateMessage = (text: string) => ({
  embeds: [createMessageEmbed(text)],
  flags: MessageFlags.Ephemeral as const,
});

/** Handles a press on one of the buttons under a now-playing message */
export async function handlePlayerControl(interaction: ButtonInteraction) {
  const control = interaction.customId.slice(PLAYER_CONTROL_PREFIX.length) as PlayerControl;
  const player = interaction.guildId ? findPlayer(interaction.guildId) : undefined;

  if (!player || !player.isControlsMessage(interaction.message.id)) {
    // Left over from an earlier song, or from before the bot left
    await interaction.update({ components: [] });
    await interaction.followUp(privateMessage("Those buttons have expired, /nowplaying gives you fresh ones"));
    return;
  }

  const member =
    interaction.member instanceof GuildMember
      ? interaction.member
      : interaction.guild?.members.cache.get(interaction.user.id);
  if (!isInBotVoiceChannel(member, interaction.guild)) {
    await interaction.reply(privateMessage("Join the bot's voice channel to use these buttons"));
    return;
  }

  // Notes the action and who took it on the message. Actions that move to
  // another song (or stop) take the buttons off: a new message carries them.
  const who = member?.displayName ?? interaction.user.username;
  const note = (text: string, keepControls = true) =>
    interaction.update({
      embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setFooter({ text: `${text} by ${who}` })],
      components: keepControls ? createPlayerControls(player.getControlsState()) : [],
    });

  switch (control) {
    case "pause": {
      const paused = player.togglePausePlayer();
      await note(paused ? "⏸️ Paused" : "▶️ Resumed");
      return;
    }
    case "rewind":
    case "forward": {
      const result = await player.seekBy(control === "rewind" ? -SEEK_STEP_MS : SEEK_STEP_MS);
      if (result === "skipped") await note("⏭️ Skipped to the next song", false);
      else await note(control === "rewind" ? "⏪ Jumped back 10s" : "⏩ Jumped ahead 10s");
      return;
    }
    case "back": {
      const result = await player.goBack();
      if (result === "restarted") await note("⏮️ Restarted the song");
      else await note("⏮️ Went back to the previous song", false);
      return;
    }
    case "skip": {
      await player.skipSong();
      await note("⏭️ Skipped", false);
      return;
    }
    case "loop": {
      await note(LOOP_NOTES[player.cycleLoopMode()]);
      return;
    }
    case "shuffle": {
      player.shuffleQueue();
      await note("🔀 Shuffled the queue");
      return;
    }
    case "stop": {
      player.stop();
      await note("⏹️ Stopped and cleared the queue", false);
      return;
    }
    case "queue": {
      await showQueue(interaction, player, { private: true });
      return;
    }
    case "autoplay": {
      const on = player.toggleAutoplay();
      await note(on ? "📻 Autoplay turned on" : "📻 Autoplay turned off");
      return;
    }
  }
}
