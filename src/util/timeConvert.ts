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
