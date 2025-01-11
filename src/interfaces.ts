import {
  APIInteractionGuildMember,
  Client,
  GuildMember,
  Interaction,
  InteractionCallbackResponse,
  Message,
} from "discord.js";
import { Shoukaku } from "shoukaku";
import { Context } from "./classes/context";

export interface ICommand {
  commandName: string;
  commandDescription: string;
  aliases: string[];
  conditions: CONDITIONS[];
  slashOptions: object[];
  execute: (
    shoukaku: Shoukaku,
    client: Client,
    message: Context,
    args: IArgument[]
  ) => Promise<void> | void;
  parseArgs: (args: string[]) => IArgument[];
}

export interface IArgument {
  name: string;
  type: number;
  value: any;
}

export enum CONDITIONS {
  SameVoice,
}

export interface IContext {
  guildId: string | null;
  channelId: string | null;
  member: GuildMember | APIInteractionGuildMember | null;
  message?: Message;
  interaction?: Interaction;
  reply: (
    mesg: string
  ) => Promise<Message<boolean> | InteractionCallbackResponse>;
}

export enum CommandTypes {
  SUB_COMMAND = 1,
  SUB_COMMAND_GROUP = 2,
  STRING = 3,
  INTEGER = 4,
  BOOLEAN = 5,
  USER = 6,
  CHANNEL = 7,
  ROLE = 8,
  MENTIONABLE = 9,
  NUMBER = 10,
  ATTACHMENT = 11,
}
