import { EmbedBuilder, Message, TextChannel, escapeMarkdown } from "discord.js";
import { truncateString } from "../util/strManipulators";
import { SyncedLine, findLyrics } from "./lyricsSource";
import { TrackInfo } from "./trackTypes";

// How often the position is checked for a new line
const TICK_MS = 1000;
// Discord rate-limits message edits; this stays well inside the limit
const MIN_EDIT_INTERVAL_MS = 2500;
// Lines show this much early, making up for the delay before an edit appears
const LEAD_MS = 500;
// Lines shown around the current one
const LINES_BEFORE = 1;
const LINES_AFTER = 3;

/** The line being sung at a position: the last one that has started, or -1 before the first */
export function lineAt(lines: SyncedLine[], positionMs: number) {
  let index = -1;
  while (index + 1 < lines.length && lines[index + 1].timeMs <= positionMs) index++;
  return index;
}

/** The current line in bold between the ones around it */
export function renderLines(lines: SyncedLine[], index: number) {
  const from = Math.max(0, index - LINES_BEFORE);
  const shown = lines.slice(from, Math.max(index, 0) + LINES_AFTER + 1);
  const rendered = shown.map((line, i) => {
    const text = escapeMarkdown(line.text) || "♪";
    return from + i === index ? `**▶ ${text}**` : text;
  });
  // Before the first line: the intro is playing
  return index === -1 ? ["**▶ ♪**", ...rendered].join("\n") : rendered.join("\n");
}

/**
 * A message that follows one song's synced lyrics as it plays, the current
 * line highlighted. Driven by the player's position, so pausing, seeking and
 * speed changes are followed too. stop() deletes the message.
 */
export class LiveLyrics {
  private message?: Message;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private shownIndex?: number;
  private lastEditAt = 0;

  constructor(
    private readonly track: TrackInfo,
    private readonly channel: TextChannel,
    private readonly getPositionMs: () => number,
  ) {
    this.start().catch((error) => console.error("Live lyrics failed:", error));
  }

  private embed(description: string) {
    return new EmbedBuilder()
      .setColor("#1db954")
      .setTitle(truncateString(`🎤 ${this.track.title}`, 256))
      .setDescription(description)
      .setFooter({ text: "Live lyrics from LRCLIB" });
  }

  private async start() {
    const lyrics = await findLyrics(this.track).catch(() => undefined);
    if (this.stopped) return;

    const lines = lyrics?.synced;
    if (!lines?.length) {
      const reason = lyrics?.instrumental
        ? "🎹 Instrumental, no lyrics to follow"
        : lyrics?.plain
          ? "No timed lyrics for this song, /lyrics shows the plain ones"
          : "No lyrics found for this song";
      this.message = await this.channel.send({ embeds: [this.embed(reason)] });
      if (this.stopped) this.remove();
      return;
    }

    const index = lineAt(lines, this.getPositionMs() + LEAD_MS);
    this.message = await this.channel.send({ embeds: [this.embed(renderLines(lines, index))] });
    this.shownIndex = index;
    this.lastEditAt = Date.now();
    // Stopped while the message was being sent
    if (this.stopped) return this.remove();
    this.timer = setInterval(() => this.tick(lines), TICK_MS);
  }

  private tick(lines: SyncedLine[]) {
    const index = lineAt(lines, this.getPositionMs() + LEAD_MS);
    if (index === this.shownIndex || Date.now() - this.lastEditAt < MIN_EDIT_INTERVAL_MS) return;
    this.shownIndex = index;
    this.lastEditAt = Date.now();
    this.message
      ?.edit({ embeds: [this.embed(renderLines(lines, index))] })
      .catch((error) => console.error("Failed to update live lyrics:", error));
  }

  private remove() {
    this.message?.delete().catch(() => {});
    this.message = undefined;
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.remove();
  }
}
