export function truncateString(input: string, maxLength: number = 32): string {
  if (input && input.length && input.length > maxLength) {
    return input.slice(0, maxLength - 3) + "...";
  }
  return input;
}
