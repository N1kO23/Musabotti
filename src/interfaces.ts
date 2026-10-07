import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import { Context } from "./classes/context";

export enum CONDITIONS {
  SameVoice,
  PlayerExists,
  QueueNotEmpty,
}

export interface ICommand {
  // Chaining .addXOption() onto SlashCommandBuilder narrows its type, so the
  // field has to accept both shapes.
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  conditions: CONDITIONS[];
  execute: (
    context: Context,
    interaction: ChatInputCommandInteraction,
  ) => Promise<void> | void;
  /** Suggests values for options registered with setAutocomplete(true) */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
}
