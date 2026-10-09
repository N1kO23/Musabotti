import play from "./play";
import disconnect from "./disconnect";
import invite from "./invite";
import skip from "./skip";
import skipto from "./skipto";
import help from "./help";
import queue from "./queue";
import nowplaying from "./nowplaying";
import remove from "./remove";
import move from "./move";
import clearQueue from "./clearQueue";
import stop from "./stop";
import volume from "./volume";
import clearFilters from "./clearFilters";
import timescale from "./timescale";
import bassboost from "./bassboost";
import loop from "./loop";
import autoplay from "./autoplay";
import lyrics from "./lyrics";
import livelyrics from "./livelyrics";
import pause from "./pause";
import shuffle from "./shuffle";
import seek from "./seek";
import lofi from "./lofi";
import nightcore from "./nightcore";
import hardcore from "./hardcore";
import { ICommand } from "../interfaces";

const commands: ICommand[] = [
  disconnect,
  invite,
  play,
  pause,
  skip,
  skipto,
  stop,
  seek,
  nowplaying,
  queue,
  remove,
  move,
  shuffle,
  clearQueue,
  loop,
  autoplay,
  lyrics,
  livelyrics,
  help,
  volume,
  clearFilters,
  timescale,
  bassboost,
  lofi,
  nightcore,
  hardcore,
];

const getCommands = () => commands;

const getCommandNamesAndDescriptions = () =>
  commands.map((command) => ({
    name: command.data.name,
    description: command.data.description,
  }));

export { getCommands, getCommandNamesAndDescriptions };
