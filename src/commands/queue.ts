import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  escapeMarkdown,
} from "discord.js";
import { CONDITIONS, ICommand } from "../interfaces";
import { getPlayerInstance } from "../services/player";
import { TrackInfo } from "../services/trackSource";
import { LOOP_MODE_LABELS, formatProgress, formatTitle, timeConvert2 } from "../util";

const PAGE_SIZE = 10;
// How long the page buttons keep working before they're removed
const PAGE_BUTTONS_TIMEOUT_MS = 2 * 60_000;

type Player = ReturnType<typeof getPlayerInstance>;

const pageCount = (player: Player) =>
  Math.max(1, Math.ceil(player.getQueue().length / PAGE_SIZE));

const formatLength = (track: TrackInfo) => {
  if (track.isLive) return "🔴 Live";
  return track.durationMs ? timeConvert2(track.durationMs) : "?:??";
};

function renderPage(player: Player, page: number) {
  const queue = player.getQueue();
  const current = player.getCurrentTrack();
  const pages = pageCount(player);
  const lines: string[] = [];

  if (current) {
    const state = player.isPaused() ? "⏸️" : "▶️";
    lines.push(
      `${state} ${formatTitle(current.track)} - ${escapeMarkdown(current.track.author)} ` +
        `\`${formatProgress(current.track, player.getPositionMs())}\``,
    );
  } else {
    lines.push("Nothing is playing right now");
  }

  lines.push("");
  if (queue.length) {
    lines.push("**Up next**");
    queue.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).forEach((entry, i) => {
      const position = page * PAGE_SIZE + i + 1;
      lines.push(`\`${position}.\` ${formatTitle(entry.track, 60)} \`${formatLength(entry.track)}\``);
    });
  } else {
    lines.push("Nothing queued up next - add songs with /play");
  }

  const totalMs = queue.reduce(
    (sum, entry) => sum + (entry.track.isLive ? 0 : entry.track.durationMs),
    0,
  );
  const footer = [
    `${queue.length} song${queue.length === 1 ? "" : "s"} queued`,
    totalMs ? `${timeConvert2(totalMs)} total` : undefined,
    LOOP_MODE_LABELS[player.getLoopMode()],
    pages > 1 ? `Page ${page + 1}/${pages}` : undefined,
  ];

  const embed = new EmbedBuilder()
    .setColor("DarkGreen")
    .setTitle("Queue")
    .setDescription(lines.join("\n"))
    .setFooter({ text: footer.filter(Boolean).join(" · ") });

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("queue-previous")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("queue-next")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );

  return { embeds: [embed], components: pages > 1 ? [buttons] : [] };
}

const command: ICommand = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Shows the current song and what's coming up"),
  conditions: [CONDITIONS.PlayerExists],
  execute: async (context, interaction) => {
    await showQueue(interaction, getPlayerInstance(context.guildId));
  },
};

/**
 * Replies with the queue and its page buttons. Also used by the 📜 player
 * control, which shows it privately to whoever pressed it.
 */
export async function showQueue(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  player: Player,
  options: { private?: boolean } = {},
) {
  let page = 0;
  // The queue can change between button presses, so re-clamp on every render
  const render = () => {
    page = Math.max(0, Math.min(page, pageCount(player) - 1));
    return renderPage(player, page);
  };

  const response = await interaction.reply({
    ...render(),
    flags: options.private ? MessageFlags.Ephemeral : undefined,
  });
  if (pageCount(player) === 1) return;

  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PAGE_BUTTONS_TIMEOUT_MS,
  });
  collector.on("collect", async (button) => {
    page += button.customId === "queue-next" ? 1 : -1;
    await button
      .update(render())
      .catch((error) => console.error("Failed to change queue page:", error));
  });
  collector.on("end", () => {
    interaction
      .editReply({ components: [] })
      .catch((error) => console.error("Failed to remove queue buttons:", error));
  });
}

export default command;
