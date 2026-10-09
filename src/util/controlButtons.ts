import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { LoopMode } from "../services/player";

/** Every player control button's custom id starts with this */
export const PLAYER_CONTROL_PREFIX = "player:";

export type PlayerControl =
  | "back"
  | "rewind"
  | "pause"
  | "forward"
  | "skip"
  | "loop"
  | "shuffle"
  | "stop"
  | "queue"
  | "autoplay";

const LOOP_LABELS: Record<LoopMode, string> = {
  off: "Loop off",
  track: "Looping song",
  queue: "Looping queue",
};

const button = (control: PlayerControl, emoji: string, style = ButtonStyle.Secondary) =>
  new ButtonBuilder()
    .setCustomId(`${PLAYER_CONTROL_PREFIX}${control}`)
    .setEmoji(emoji)
    .setStyle(style);

/** The playback buttons under a now-playing message, reflecting the player's state */
export const createPlayerControls = (state: {
  paused: boolean;
  loopMode: LoopMode;
  autoplay: boolean;
}) => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    button("back", "⏮️"),
    button("rewind", "⏪"),
    button("pause", state.paused ? "▶️" : "⏸️", ButtonStyle.Primary),
    button("forward", "⏩"),
    button("skip", "⏭️"),
  ),
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    button("loop", state.loopMode === "track" ? "🔂" : "🔁", state.loopMode === "off" ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setLabel(LOOP_LABELS[state.loopMode]),
    button("shuffle", "🔀"),
    button("stop", "⏹️", ButtonStyle.Danger),
    button("queue", "📜").setLabel("Queue"),
    button("autoplay", "📻", state.autoplay ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setLabel(state.autoplay ? "Autoplay on" : "Autoplay off"),
  ),
];
