export interface TimescaleSettings {
  speed: number;
  pitch: number;
  rate: number;
}

export interface FreqSettings {
  frequency: number;
  depth: number;
}

export interface LowPassSettings {
  smoothing: number;
}

export interface FilterState {
  volume: number;
  timescale: TimescaleSettings;
  /** 15 bands, Lavalink-style gain from -0.25 (cut) to 1.0 (boost), 0 = flat */
  equalizer: number[];
  tremolo?: FreqSettings;
  vibrato?: FreqSettings;
  lowPass?: LowPassSettings;
  distortion?: boolean;
}

export interface FilterUpdate {
  volume?: number;
  timescale?: Partial<TimescaleSettings>;
  equalizerBands?: { band: number; gain: number }[];
  tremolo?: FreqSettings;
  vibrato?: FreqSettings;
  lowPass?: LowPassSettings;
  distortion?: boolean;
}

export const defaultFilterState = (): FilterState => ({
  volume: 1,
  timescale: { speed: 1, pitch: 1, rate: 1 },
  equalizer: new Array(15).fill(0),
});

// Lavalink's 15-band equalizer center frequencies, remapped onto ffmpeg's
// 18-band superequalizer. Several Lavalink bands land on the same
// superequalizer band since ffmpeg's bands are coarser at the low end.
const SUPEREQ_BAND_FOR_LAVALINK_BAND = [
  1, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 13, 14, 16, 18,
];

function buildEqualizer(bands: number[]): string | null {
  // ffmpeg's superequalizer bands are linear multipliers from 0-20, default 1 (flat)
  const deltas = new Array(18).fill(0);
  bands.forEach((gain, band) => {
    const superBand = SUPEREQ_BAND_FOR_LAVALINK_BAND[band];
    if (!superBand || !gain) return;
    deltas[superBand - 1] += gain * 4;
  });
  if (deltas.every((d) => d === 0)) return null;
  const params = deltas
    .map((delta, i) => `${i + 1}b=${Math.min(20, Math.max(0, 1 + delta)).toFixed(2)}`)
    .join(":");
  return `superequalizer=${params}`;
}

// atempo only accepts 0.5-2.0 per instance, chain multiple stages for extreme values
function buildAtempoChain(tempo: number): string[] {
  const stages: string[] = [];
  let remaining = tempo;
  while (remaining > 2) {
    stages.push("atempo=2.0");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    stages.push("atempo=0.5");
    remaining /= 0.5;
  }
  stages.push(`atempo=${remaining.toFixed(4)}`);
  return stages;
}

function buildTimescale(timescale: TimescaleSettings): string[] {
  const { speed, pitch, rate } = timescale;
  if (speed === 1 && pitch === 1 && rate === 1) return [];

  const totalPitch = pitch * rate;
  const totalTempo = speed * rate;
  const filters: string[] = [];

  if (totalPitch !== 1) {
    // asetrate reinterprets existing samples at a new rate without resampling
    // first, so it has to start from a known rate - source audio is often
    // 44100Hz (or other rates), not already 48000Hz, and skipping this
    // resample compounds the mismatch into the pitch/tempo shift itself
    // (e.g. a 44100Hz source made every effect ~9% stronger than requested).
    filters.push("aresample=48000", `asetrate=48000*${totalPitch.toFixed(4)}`, "aresample=48000");
  }
  const tempoAfterPitchShift = totalTempo / totalPitch;
  if (tempoAfterPitchShift !== 1) {
    filters.push(...buildAtempoChain(tempoAfterPitchShift));
  }
  return filters;
}

export function buildFilterChain(filters: FilterState): string[] {
  const chain: string[] = [];

  const eq = buildEqualizer(filters.equalizer);
  if (eq) chain.push(eq);

  chain.push(...buildTimescale(filters.timescale));

  if (filters.tremolo) {
    chain.push(`tremolo=f=${filters.tremolo.frequency}:d=${filters.tremolo.depth}`);
  }
  if (filters.vibrato) {
    chain.push(`vibrato=f=${filters.vibrato.frequency}:d=${filters.vibrato.depth}`);
  }
  if (filters.lowPass) {
    const cutoff = Math.max(200, 20000 - filters.lowPass.smoothing * 200);
    chain.push(`lowpass=f=${cutoff}`);
  }
  if (filters.distortion) {
    chain.push("asoftclip=type=tanh:threshold=0.3");
  }
  if (filters.volume !== 1) {
    chain.push(`volume=${filters.volume}`);
  }

  return chain;
}
