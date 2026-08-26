export const truncateString = (
  input: string,
  maxLength: number = 32,
): string => {
  if (input && input.length && input.length > maxLength) {
    return input.slice(0, maxLength - 3) + "...";
  }
  return input;
};

export const splitString = (
  input: string,
  maxLength: number = 32,
): string[] => {
  const result: string[] = [];
  let currentIndex = 0;
  while (currentIndex < input.length) {
    result.push(input.slice(currentIndex, currentIndex + maxLength));
    currentIndex += maxLength;
  }
  return result;
};

export const splitStringBySeparator = (
  input: string,
  separator: string,
  maxLength: number = 32,
): string[] => {
  const result: string[] = [];
  let currentPart = "";
  const parts = input.split(separator);
  for (const part of parts) {
    if ((currentPart + separator + part).length > maxLength) {
      if (currentPart.length > 0) {
        result.push(currentPart);
      }
      currentPart = part;
    } else {
      if (currentPart.length > 0) {
        currentPart += separator;
      }
      currentPart += part;
    }
  }
  if (currentPart.length > 0) {
    result.push(currentPart);
  }
  return result;
};
