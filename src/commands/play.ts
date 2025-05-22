import { Client } from "discord.js";
import { Playlist, Shoukaku, Track } from "shoukaku";
import { CommandTypes, IArgument, ICommand } from "../interfaces";
import { TrackExt, getPlayer } from "../services/player";
import { createEmbed, createPlaylistEmbed } from "../util";
import { Context } from "../classes/context";

class Command implements ICommand {
  commandName = "play";
  commandDescription = "Play a song";
  aliases = ["p"];
  conditions = [];
  slashOptions = [
    {
      name: "song",
      description: "Song name or url",
      type: CommandTypes.STRING,
      required: true,
    },
  ];
  execute = async (
    shoukaku: Shoukaku,
    client: Client,
    context: Context,
    args: IArgument[]
  ) => {
    if (!shoukaku) return;
    const searchArg = args.find((arg) => arg.name === "song");
    if (!searchArg) {
      context.reply("How the fuck did you do that?");
      return;
    }
    const res = searchArg?.value.startsWith("https://")
      ? searchArg.value
      : `ytsearch:${searchArg.value}`;

    !context.member?.voice.channelId &&
      context.reply("Either you aren't in VC or I couldn't find it");

    if (!context.guildId || !context.member?.voice.channelId) return;

    const player = await getPlayer(shoukaku, { context });

    const result = await player?.player?.node.rest.resolve(res);
    if (!result?.data) return;

    const trol = result.data as Track | Playlist;

    const isPlaylist = (obj: any): obj is Playlist => {
      return 'tracks' in obj;
    }

    if (isPlaylist(trol)) {
      const embed = createPlaylistEmbed(trol.tracks);
      for (let i = 0; i < trol.tracks.length; i++) {
        const metadata = trol.tracks[i] as Track;

        if (!metadata) {
          context.reply("The song was not found");
          return;
        }

        const channelId = context.channelId ?? undefined;
        await player?.queueTrack(new TrackExt(metadata, channelId));
      }
      context.reply({ embeds: [embed] });
    } else {
      const metadata = Array.isArray(trol) ? trol[0] as Track : trol as Track;

      if (!metadata) {
        context.reply("The song was not found");
        return;
      }

      context.reply({ embeds: [createEmbed(metadata)] });
      const channelId = context.channelId ?? undefined;
      await player?.queueTrack(new TrackExt(metadata, channelId));
    }
  };
  parseArgs = (args: string[]) => {
    return [{ name: "song", type: CommandTypes.STRING, value: args.join(" ") }];
  };
}

export default Command;
