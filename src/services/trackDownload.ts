import { randomUUID } from "crypto";
import { EventEmitter, once } from "events";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Readable } from "stream";

const DOWNLOAD_DIR = path.join(os.tmpdir(), "musabotti-downloads");
const READ_CHUNK_BYTES = 64 * 1024;

/** Deletes downloads a previous run left behind, e.g. after a crash */
export function clearDownloads() {
  fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
}

/**
 * Saves a track's audio to a temp file as fast as its source delivers it,
 * while readers (see createReader) follow along from the start. A seek,
 * filter change or track loop then replays the track from disk instead of
 * fetching it again: through yt-dlp that means seconds of silence while it
 * starts back up, and YouTube occasionally refuses rapid repeat downloads.
 */
export class TrackDownload {
  private readonly filePath = path.join(DOWNLOAD_DIR, `${randomUUID()}.audio`);
  private readonly abort = new AbortController();
  // Every reader waiting for more data listens here
  private readonly progress = new EventEmitter().setMaxListeners(0);
  private bytesSaved = 0;
  private finished = false;
  private error?: Error;

  constructor(open: (signal: AbortSignal) => Promise<Readable>) {
    // Failures are recorded for readers rather than thrown
    void this.save(open);
  }

  get failed() {
    return Boolean(this.error);
  }

  private async save(open: (signal: AbortSignal) => Promise<Readable>) {
    let file: fs.promises.FileHandle | undefined;
    try {
      await fs.promises.mkdir(DOWNLOAD_DIR, { recursive: true });
      file = await fs.promises.open(this.filePath, "w");
      // Iterated right after it's opened, so its errors always have a listener
      const source = await open(this.abort.signal);
      for await (const chunk of source) {
        await file.write(chunk);
        this.bytesSaved += chunk.length;
        this.progress.emit("update");
      }
      this.finished = true;
    } catch (error) {
      this.error ??= error instanceof Error ? error : new Error(String(error));
    } finally {
      await file?.close().catch(() => {});
      // discard() may have run before the file was even created
      if (this.abort.signal.aborted) await fs.promises.rm(this.filePath, { force: true }).catch(() => {});
      this.progress.emit("update");
    }
  }

  /** Stops downloading and deletes the file. Readers still open error out. */
  discard() {
    if (this.abort.signal.aborted) return;
    this.error ??= new Error("Download discarded");
    this.abort.abort();
    fs.rm(this.filePath, { force: true }, () => {});
    this.progress.emit("update");
  }

  /** The track from the start, following along while it's still downloading */
  createReader(): Readable {
    const download = this;
    let file: fs.promises.FileHandle | undefined;
    let position = 0;

    const readNext = async (reader: Readable) => {
      while (position >= download.bytesSaved) {
        if (download.error) throw download.error;
        if (download.finished) {
          reader.push(null);
          return;
        }
        await once(download.progress, "update");
        if (reader.destroyed) return;
      }
      if (!file) {
        file = await fs.promises.open(download.filePath, "r");
        // Destroyed while opening: destroy() had no handle to close yet
        if (reader.destroyed) {
          await file.close();
          return;
        }
      }
      const length = Math.min(READ_CHUNK_BYTES, download.bytesSaved - position);
      const { bytesRead, buffer } = await file.read(Buffer.allocUnsafe(length), 0, length, position);
      position += bytesRead;
      reader.push(buffer.subarray(0, bytesRead));
    };

    return new Readable({
      highWaterMark: READ_CHUNK_BYTES,
      read() {
        readNext(this).catch((error) => this.destroy(error));
      },
      destroy(error, callback) {
        if (!file) return callback(error);
        file
          .close()
          .catch(() => {})
          .finally(() => callback(error));
      },
    });
  }
}
