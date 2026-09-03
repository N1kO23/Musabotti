import { setDefaultResultOrder } from "node:dns";
// Since Node 17, dns.lookup() no longer prefers IPv4 by default. Discord's voice
// UDP IP-discovery step hangs (instead of erroring) when it draws an unroutable
// IPv6 address first, which is why a voice connection can join but never
// reach Ready inside Docker. This must run before anything else connects.
setDefaultResultOrder("ipv4first");

import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Guild,
  REST,
  Routes,
} from "discord.js";
import { getCommands } from "./commands";
import { ICommand } from "./interfaces";
import { createMessageEmbed, verifyConditions } from "./util";
import { Context } from "./classes/context";

import * as dotenv from "dotenv";
dotenv.config();

const commands = new Collection<string, ICommand>();

getCommands().forEach((command) => {
  commands.set(command.data.name, command);
  console.log(`[COMMANDS]: ${command.data.name}`);
});

const commandPayload = commands.map((command) => command.data.toJSON());

const rest = new REST().setToken(process.env.DISCORD_TOKEN ?? "");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  readyClient.user.setActivity("/help", { type: ActivityType.Listening });

  await Promise.all(
    readyClient.guilds.cache.map((guild) => registerSlashCommands(guild)),
  );
});

client.on(Events.GuildCreate, async (guild) => {
  console.log(`Joined guild '${guild.name}'`);
  await registerSlashCommands(guild);
});

client.on(Events.GuildDelete, async (guild) => {
  console.log(`Left guild '${guild.name}'`);

  try {
    await rest.delete(
      Routes.applicationGuildCommands(process.env.DISCORD_APP_ID ?? "", guild.id),
    );
    console.log(`Slash commands deleted successfully for guild ${guild.name}!`);
  } catch (error) {
    console.error("Failed to delete slash commands:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.guildId) {
    await interaction.reply({ embeds: [createMessageEmbed("Commands can only be used in a server!")] });
    return;
  }

  const commandInstance = commands.get(interaction.commandName);
  if (!commandInstance) {
    await interaction.reply({ embeds: [createMessageEmbed("Whaa...? I don't understand that command")] });
    return;
  }

  const context = new Context(interaction);

  try {
    verifyConditions(commandInstance.conditions, context);
    await commandInstance.execute(context, interaction);
  } catch (error: any) {
    console.error(error);
    await context
      .reply(error?.message ?? "Something went wrong")
      .catch((replyError) => console.error("Failed to report error:", replyError));
  }
});

const registerSlashCommands = async (guild: Guild) => {
  try {
    // The put method fully refreshes all commands in the guild with the current set
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_APP_ID ?? "", guild.id),
      { body: commandPayload },
    );
    console.log(
      `Slash commands registered successfully for guild ${guild.name}!`,
    );
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
};

client.login(process.env.DISCORD_TOKEN);
