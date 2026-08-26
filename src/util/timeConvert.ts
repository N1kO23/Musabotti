/**
 * Converts a numeric time to a human readable string
 */
export const timeConvert = (time: number): string => {
  const numSeconds = Math.floor(time / 1000);
  const hours = Math.floor(numSeconds / 3600);
  const minutes = Math.floor((numSeconds % 3600) / 60);
  const seconds = numSeconds % 60;

  let result = "";

  if (hours > 0) {
    result += `${hours} hour${hours > 1 ? "s" : ""}`;
    if (minutes > 0 || seconds > 0) {
      result += ", ";
    }
  }

  if (minutes > 0) {
    result += `${minutes} minute${minutes > 1 ? "s" : ""}`;
    if (seconds > 0) {
      result += ", ";
    }
  }

  if (seconds > 0) {
    result += `${seconds} second${seconds > 1 ? "s" : ""}`;
  }

  return result;
};

export const timeConvert2 = (milliseconds: number): string => {
  const seconds = Math.floor((milliseconds / 1000) % 60);
  const minutes = Math.floor((milliseconds / (1000 * 60)) % 60);
  const hours = Math.floor((milliseconds / (1000 * 60 * 60)) % 24);

  const hoursStr = hours > 0 ? `${hours}:` : "";
  const minutesStr =
    hours > 0 ? String(minutes).padStart(2, "0") : String(minutes);
  const secondsStr = String(seconds).padStart(2, "0");

  return `${hoursStr}${minutesStr}:${secondsStr}`;
};
