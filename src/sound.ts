import oceanUrl from "./assets/ocean-waves.mp3?url";
import splashUrl from "./assets/water-splash.mp3?url";
import foldUrl from "./assets/paper-folds.wav?url";
import chainPullUrl from "./assets/chain-pull.wav?url";
import chainBreakUrl from "./assets/chain-break.wav?url";

// The edited track follows the half fold, corners, brim, pocket folds and hull opening.
const foldBoundaries = [0, 0.19, 0.36, 0.46, 0.52, 0.64, 0.71, 0.83, 1];

function preloadEffect(url: string) {
  return fetch(url)
    .then((response) => response.arrayBuffer())
    .catch(() => null);
}

export function prepareSound() {
  const ocean = new Audio(oceanUrl);
  ocean.preload = "auto";
  ocean.loop = true;
  // Begin on the first full swell. Subsequent loops use the whole recording.
  ocean.currentTime = 7.8;

  const splashData = preloadEffect(splashUrl);
  const foldData = preloadEffect(foldUrl);
  const pullData = preloadEffect(chainPullUrl);
  const breakData = preloadEffect(chainBreakUrl);
  let pullBuffer: AudioBuffer | undefined;
  let breakBuffer: AudioBuffer | undefined;
  let pulling: AudioBufferSourceNode | undefined;
  let foldBuffer: AudioBuffer | undefined;
  let nextFold = 0;
  let splash: AudioBufferSourceNode | undefined;
  let waterFilter: BiquadFilterNode | undefined;
  let surfGain: GainNode | undefined;
  let lastDepth = 0;
  const surfaceGain = 1.65;
  const surfaceHz = 20000;
  const submergedHz = 2400;

  return {
    start() {
      const context = new AudioContext({ latencyHint: "interactive" });
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = surfaceHz;
      filter.Q.value = -3;
      filter.connect(context.destination);
      waterFilter = filter;
      void pullData
        .then(async (data) => {
          if (data) pullBuffer = await context.decodeAudioData(data);
        })
        .catch(() => {});
      void breakData
        .then(async (data) => {
          if (data) breakBuffer = await context.decodeAudioData(data);
        })
        .catch(() => {});

      surfGain = context.createGain();
      surfGain.gain.value = surfaceGain;
      context.createMediaElementSource(ocean).connect(surfGain).connect(filter);
      void ocean.play().catch(() => {});
      void foldData
        .then(async (data) => {
          if (data) foldBuffer = await context.decodeAudioData(data);
        })
        .catch(() => {});
      void Promise.all([context.resume(), splashData])
        .then(async ([, data]) => {
          if (!data) return;
          const buffer = await context.decodeAudioData(data);
          const gain = context.createGain();
          gain.gain.value = 0.19;
          gain.connect(filter);
          splash = context.createBufferSource();
          splash.buffer = buffer;
          splash.connect(gain);
        })
        .catch(() => {});
    },
    fold(progress: number, duration: number) {
      if (
        !foldBuffer ||
        !waterFilter ||
        progress <= 0 ||
        progress >= 1 ||
        progress < foldBoundaries[nextFold]
      )
        return;

      // At low frame rates, enter the current crease at its actual visual position.
      while (foldBoundaries[nextFold + 1] <= progress) nextFold++;
      const end = foldBoundaries[++nextFold];
      const source = waterFilter.context.createBufferSource();
      source.buffer = foldBuffer;
      source.playbackRate.value = foldBuffer.duration / duration;
      source.connect(waterFilter);
      source.start(
        0,
        progress * foldBuffer.duration,
        (end - progress) * foldBuffer.duration,
      );
    },
    pullChain(duration: number) {
      if (!pullBuffer || !waterFilter) return;
      pulling = waterFilter.context.createBufferSource();
      pulling.buffer = pullBuffer;
      pulling.playbackRate.value = pullBuffer.duration / duration;
      pulling.connect(waterFilter);
      pulling.start();
    },
    release() {
      pulling?.stop();
      if (breakBuffer && waterFilter) {
        const snap = waterFilter.context.createBufferSource();
        snap.buffer = breakBuffer;
        snap.connect(waterFilter);
        snap.start();
      }
      if (!surfGain) return;
      const now = surfGain.context.currentTime;
      surfGain.gain.setValueAtTime(surfaceGain, now);
      surfGain.gain.linearRampToValueAtTime(2.1, now + 2);
    },
    setDepth(depth: number) {
      if (!waterFilter || depth === lastDepth) return;
      lastDepth = depth;
      const frequency = surfaceHz * (submergedHz / surfaceHz) ** depth;
      waterFilter.frequency.setTargetAtTime(
        frequency,
        waterFilter.context.currentTime,
        0.035,
      );
    },
    returnToPortfolio() {
      pulling?.stop();
      pulling = undefined;
      if (!surfGain || !waterFilter) return;
      const now = surfGain.context.currentTime;
      waterFilter.frequency.setTargetAtTime(surfaceHz, now, 0.08);
      surfGain.gain.cancelScheduledValues(now);
      surfGain.gain.setTargetAtTime(0, now, 0.3);
    },
    land() {
      // The recording has roughly 130 ms of lead-in before the impact.
      splash?.start(0, 0.12);
      splash = undefined;
    },
  };
}
