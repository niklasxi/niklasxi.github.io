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
  let unfoldBuffer: AudioBuffer | undefined;
  let splashBuffer: AudioBuffer | undefined;
  let splashGain: GainNode | undefined;
  let nextFold = 0;
  let splash: AudioBufferSourceNode | undefined;
  let waterFilter: BiquadFilterNode | undefined;
  let surfGain: GainNode | undefined;
  let airBuffer: AudioBuffer | undefined;
  let lastHover = -1;
  let lastDepth = 0;
  const surfaceGain = 1.65;
  const surfaceHz = 20000;
  const submergedHz = 2400;

  function cue(kind: "title" | "dive" | "arrival" | "paper" | "hover", index = 0) {
    if (!waterFilter || !airBuffer) return;
    const context = waterFilter.context;
    if (context.state !== "running") return;
    const now = context.currentTime;
    if (kind === "hover") {
      if (now - lastHover < 0.3) return;
      lastHover = now;
    }
    const duration = kind === "dive" ? 1.5 : kind === "title" ? 1.1 : kind === "hover" ? 0.09 : 0.45;
    const source = context.createBufferSource();
    source.buffer = airBuffer;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(kind === "dive" ? 1600 : 700, now);
    filter.frequency.exponentialRampToValueAtTime(kind === "dive" ? 150 : 1900, now + duration);
    const gain = context.createGain();
    const volume = kind === "hover" ? 0.012 : kind === "title" ? 0.045 : 0.035;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + duration * 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(waterFilter);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(now, 0, duration);
    if (kind !== "title" && kind !== "arrival") return;
    const tone = context.createOscillator();
    const toneGain = context.createGain();
    tone.frequency.value = (kind === "arrival" ? 220 : 330) * 2 ** ([0, 2, 7, 4][index % 4] / 12);
    toneGain.gain.setValueAtTime(0, now);
    toneGain.gain.linearRampToValueAtTime(0.017, now + 0.06);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    tone.connect(toneGain).connect(waterFilter);
    tone.onended = () => { tone.disconnect(); toneGain.disconnect(); };
    tone.start(now);
    tone.stop(now + duration);
  }

  return {
    cue,
    settleOcean() {
      if (!surfGain) return;
      const now = surfGain.context.currentTime;
      surfGain.gain.cancelScheduledValues(now);
      surfGain.gain.setTargetAtTime(1.45, now, 1.2);
    },
    start() {
      if (waterFilter && surfGain) {
        nextFold = 0;
        lastDepth = 0;
        const now = waterFilter.context.currentTime;
        waterFilter.frequency.setValueAtTime(surfaceHz, now);
        surfGain.gain.cancelScheduledValues(now);
        surfGain.gain.setTargetAtTime(surfaceGain, now, 0.15);
        void (waterFilter.context as AudioContext).resume();
        void ocean.play().catch(() => {});
        return;
      }
      const context = new AudioContext({ latencyHint: "interactive" });
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = surfaceHz;
      filter.Q.value = -3;
      filter.connect(context.destination);
      waterFilter = filter;
      // Prepare the airy accents once, away from camera and title transitions.
      airBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const air = airBuffer.getChannelData(0);
      for (let i = 0; i < air.length; i++) air[i] = Math.random() * 2 - 1;
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
          if (data) {
            foldBuffer = await context.decodeAudioData(data);
            unfoldBuffer = context.createBuffer(foldBuffer.numberOfChannels, foldBuffer.length, foldBuffer.sampleRate);
            for (let channel = 0; channel < foldBuffer.numberOfChannels; channel++)
              unfoldBuffer.copyToChannel(foldBuffer.getChannelData(channel).slice().reverse(), channel);
          }
        })
        .catch(() => {});
      void Promise.all([context.resume(), splashData])
        .then(async ([, data]) => {
          if (!data) return;
          const buffer = await context.decodeAudioData(data);
          splashBuffer = buffer;
          const gain = context.createGain();
          gain.gain.value = 0.19;
          gain.connect(filter);
          splashGain = gain;
          splash = context.createBufferSource();
          splash.buffer = buffer;
          splash.connect(gain);
        })
        .catch(() => {});
    },
    click() {
      if (!waterFilter) return;
      const context = waterFilter.context;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const now = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(720, now);
      oscillator.frequency.exponentialRampToValueAtTime(310, now + 0.045);
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      oscillator.connect(gain).connect(waterFilter);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now);
      oscillator.stop(now + 0.07);
    },
    unfold(fold: number, duration: number) {
      if (!unfoldBuffer || !waterFilter || fold <= 0) return;
      const source = waterFilter.context.createBufferSource();
      source.buffer = unfoldBuffer;
      source.playbackRate.value = unfoldBuffer.duration * fold / (duration * 0.68);
      source.connect(waterFilter);
      source.start(waterFilter.context.currentTime + duration * 0.15, (1 - fold) * unfoldBuffer.duration, fold * unfoldBuffer.duration);
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
      if (!splash && splashBuffer && splashGain && waterFilter) {
        splash = waterFilter.context.createBufferSource();
        splash.buffer = splashBuffer;
        splash.connect(splashGain);
      }
      // The recording has roughly 130 ms of lead-in before the impact.
      splash?.start(0, 0.12);
      splash = undefined;
    },
  };
}
