import { PassThrough, Readable } from "stream";

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 1000;

/**
 * Fetches a url as a Node stream, automatically resuming via an HTTP Range
 * request if the connection drops partway through. Plain fetch() has no
 * built-in retry/resume (unlike ffmpeg's own -reconnect flags, which this
 * replaces now that the fetch happens in Node instead of ffmpeg - see
 * player.ts for why).
 */
export function createResumableAudioStream(url: string, signal: AbortSignal): Readable {
  const output = new PassThrough();
  let bytesReceived = 0;
  let attempt = 0;

  const run = async () => {
    while (!signal.aborted) {
      try {
        const response = await fetch(url, {
          signal,
          headers: bytesReceived > 0 ? { Range: `bytes=${bytesReceived}-` } : undefined,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Audio fetch failed with status ${response.status}`);
        }

        attempt = 0;
        const nodeStream = Readable.fromWeb(response.body as any);
        for await (const chunk of nodeStream) {
          bytesReceived += chunk.length;
          if (!output.write(chunk)) {
            await new Promise((resolve) => output.once("drain", resolve));
          }
        }
        output.end();
        return;
      } catch (error) {
        if (signal.aborted) return;
        attempt++;
        if (attempt > MAX_RETRIES) {
          output.destroy(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        console.error(
          `Audio fetch dropped (attempt ${attempt}/${MAX_RETRIES}), resuming from byte ${bytesReceived}:`,
          error,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  };

  run();
  return output;
}
