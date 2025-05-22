import {
  ActivityType,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Guild,
  Partials,
  REST,
  Routes,
} from "discord.js";
import { Shoukaku, Connectors } from "shoukaku";
import { getCommands } from "./commands";
import { IArgument, ICommand } from "./interfaces";
import { verifyConditions } from "./util";
import { Context } from "./classes/context";
import { migrate, openDb } from "./database/controller";

import * as dotenv from "dotenv";
dotenv.config();

const prefix = process.env.PREFIX ?? "!";

const db = openDb().then((ready) => {
  console.log("Database ready!");
  migrate(ready, "./migrations/init_db.sql");
  return ready;
});

const Nodes = [
  {
    name: process.env.LAVALINK_NAME ?? "Localhost",
    url: process.env.LAVALINK_URL ?? "localhost:6969",
    auth: process.env.LAVALINK_AUTH ?? "shirakami_fubuki",
  },
];

const commands = new Collection<string, ICommand>();

getCommands().map((command) => {
  const names = command.aliases.concat(command.commandName);
  names.forEach((name) => {
    commands.set(name, command);
  });
  console.log(`[COMMANDS]: ${command.commandName}`);
});

const mappedCommands = commands.map((command) => ({
  name: command.commandName,
  description: command.commandDescription,
  options: command.slashOptions,
  type: command.slashOptions.length > 0 ? 1 : undefined,
}));

const uniqueCommands = Array.from(
  new Set(mappedCommands.map((obj) => obj.name))
).map((name) => {
  return mappedCommands.find((obj) => obj.name === name);
});

const rest = new REST().setToken(process.env.DISCORD_TOKEN ?? "");

const client = new Client({
  intents: [
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});
const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), Nodes);
// ALWAYS handle error, logging it will do
shoukaku.on(Events.Error, (_, error) => console.error(error));

// Logged on successfully
shoukaku.on(Events.ClientReady, async () => {
  console.log("ready!");
  client.user?.setActivity(`${prefix}help`, {
    type: ActivityType.Listening,
  });

  client.guilds.cache.map(async (guild) => {
    await registerSlashCommands(guild);
    await guild.members.me?.setNickname(null);
  });
});

shoukaku.on("disconnect", () => console.log("FUCK! disconnected..."));

client.on(Events.GuildCreate, async (guild) => {
  console.log(`Joined guild '${guild.name}'`);
  await registerSlashCommands(guild);
});

client.on(Events.GuildDelete, async (guild) => {
  console.log(`Left guild '${guild.name}'`);

  try {
    // The delete method is used to fully remove all commands in the guild with the current set
    await rest.delete(
      Routes.applicationGuildCommands(
        process.env.DISCORD_APP_ID ?? "",
        guild.id
      )
    );
    console.log(`Slash commands deleted successfully for guild ${guild.name}!`);
  } catch (error) {
    console.error("Failed to delete slash commands:", error);
  }
});

client.on(Events.MessageCreate, async (message) => {
  const content = message.content;
  if (!content.startsWith(prefix) || message.author.bot) return;

  const args = content.slice(prefix.length, content.length).split(/ +/); // Get all the arguments of the message

  const command = args.shift(); // Initialize the command variable
  if (!command) return;

  if (commands.has(command)) {
    const commandInstance = commands.get(command);
    if (!commandInstance) return;
    try {
      const context = new Context({
        guildId: message.guildId,
        client,
        channelId: message.channelId,
        message,
        member: message.member,
      });
      verifyConditions({
        client,
        guild: message.guild,
        conditions: commandInstance.conditions,
        context,
      });
      try {
        const parsedArgs = commandInstance.parseArgs(args);
        try {
          await commandInstance.execute(shoukaku, client, context, parsedArgs);
        } catch (error) {
          message.reply(error?.toString() ?? "Error executing command");
          console.error(error);
        }
      } catch (error) {
        message.reply(error?.toString() ?? "Error parsing arguments");
        console.error(error);
      }
    } catch (error) {
      message.reply(error?.toString() ?? "Unknown error happened");
      console.error(error);
    }
  } else {
    console.log("Unknown command executed: ", command);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isCommand()) return;

  const command = interaction.commandName;
  const args = interaction.options.data;

  const context = new Context({
    guildId: interaction.guildId,
    client,
    channelId: interaction.channelId,
    interaction,
    member: interaction.member,
  });

  if (commands.has(command)) {
    const commandInstance = commands.get(command);
    if (!commandInstance) return;
    try {
      verifyConditions({
        client,
        guild: interaction.guild,
        conditions: commandInstance.conditions,
        context,
      });
      try {
        await commandInstance.execute(
          shoukaku,
          client,
          context,
          args as IArgument[]
        );
      } catch (error) {
        context.reply(error?.toString() ?? "Error executing command");
        console.error(error);
      }
    } catch (error) {
      context.reply(error?.toString() ?? "Unknown error happened");
      console.error(error);
    }
  } else {
    context.reply("Whaa...? I don't understand that command");
  }
});

const registerSlashCommands = async (guild: Guild) => {
  try {
    // The put method is used to fully refresh all commands in the guild with the current set
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_APP_ID ?? "",
        guild.id
      ),
      { body: uniqueCommands }
    );
    console.log(
      `Slash commands registered successfully for guild ${guild.name}!`
    );
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
};

client.login(process.env.DISCORD_TOKEN);
