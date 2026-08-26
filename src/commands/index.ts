import play from "./play";
import disconnect from "./disconnect";
import invite from "./invite";
import skip from "./skip";
import help from "./help";
import queue from "./queue";
import volume from "./volume";
import clearFilters from "./clearFilters";
import timescale from "./timescale";
import bassboost from "./bassboost";
import loop from "./loop";
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
  skip,
  help,
  queue,
  volume,
  clearFilters,
  timescale,
  bassboost,
  loop,
  pause,
  shuffle,
  seek,
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
