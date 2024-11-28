import Play from "./play";
import Disconnect from "./disconnect";
import Invite from "./invite";
import Skip from "./skip";
import Help from "./help";
import Queue from "./queue";
import Volume from "./volume";
import ClearFilters from "./clearFilters";
import Timescale from "./timescale";
import Bassboost from "./bassboost";
import Loop from "./loop";
import Pause from "./pause";
import Shuffle from "./shuffle";
import Seek from "./seek";

let commandClasses = [Disconnect, Invite, Play, Skip, Help, Queue, Volume, ClearFilters, Timescale, Bassboost, Loop, Pause, Shuffle, Seek];

const getCommands = () => {
  const commands = commandClasses.map((command) => new command());
  return commands;
};

const getCommandNamesAndDescriptions = () => {
  const commands = commandClasses.map((command) => {
    const temp = new command();
    return {
      name: temp.commandName,
      desc: temp.commandDescription,
    };
  });
  return commands;
};

export { getCommands, getCommandNamesAndDescriptions };
