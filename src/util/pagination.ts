import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
} from "discord.js";

// How long the page buttons keep working before they're removed
const PAGE_BUTTONS_TIMEOUT_MS = 2 * 60_000;

const pageButtons = (page: number, pages: number) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("page-previous")
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("page-next")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pages - 1),
  );

/**
 * Replies with the first page of something and ◀ ▶ buttons to flip through
 * the rest for a couple of minutes. Pages are rendered on every flip, so
 * content that changes meanwhile (the queue) stays current. Works whether or
 * not the reply was deferred.
 */
export async function replyWithPages(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  renderPage: (page: number) => EmbedBuilder,
  pageCount: () => number,
  options: { private?: boolean } = {},
) {
  let page = 0;
  const render = () => {
    const pages = pageCount();
    page = Math.max(0, Math.min(page, pages - 1));
    return { embeds: [renderPage(page)], components: pages > 1 ? [pageButtons(page, pages)] : [] };
  };

  const reply = interaction.deferred
    ? await interaction.editReply(render())
    : await interaction.reply({
        ...render(),
        flags: options.private ? MessageFlags.Ephemeral : undefined,
      });
  if (pageCount() <= 1) return;

  const collector = reply.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PAGE_BUTTONS_TIMEOUT_MS,
  });
  collector.on("collect", async (button) => {
    page += button.customId === "page-next" ? 1 : -1;
    await button.update(render()).catch((error) => console.error("Failed to change page:", error));
  });
  collector.on("end", () => {
    interaction
      .editReply({ components: [] })
      .catch((error) => console.error("Failed to remove page buttons:", error));
  });
}
