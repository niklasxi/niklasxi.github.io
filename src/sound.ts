import { planeCreases } from "./paperFlight";
import scoreUrl from "../Cold Room Tension.mp3?url";
import oceanUrl from "./assets/ocean-waves.mp3?url";
import thunderUrl from "./assets/dry-thunder.mp3?url";
import splashUrl from "./assets/water-splash.mp3?url";
import foldUrl from "./assets/paper-folds.wav?url";
import chainPullUrl from "./assets/chain-pull.wav?url";
import flashUrl from "./assets/kauasilbershlachparodes-camera-flash-494027.mp3?url";
import chainBreakUrl from "./assets/chain-break.wav?url";

// The edited track follows the half fold, corners, brim, pocket folds and hull opening.
const foldBoundaries = [0, 0.19, 0.36, 0.46, 0.52, 0.64, 0.71, 0.83, 1];
const planeFoldSounds = Object.values(planeCreases).map(([start, end], index) => ({
  start, end, excerpt: [0, 2, 3, 5, 7][index],
}));

function smoothstep(a: number, b: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function preloadEffect(url: string) {
  return fetch(url)
    .then((response) => response.arrayBuffer())
    .catch(() => null);
}

// A stereo shower made from overlapping broadband impacts. Wrap the tails
// across the buffer boundary so the bed loops without a seam.
function createRainBuffer(context: AudioContext) {
  const rate = context.sampleRate;
  const length = rate * 7;
  const buffer = context.createBuffer(2, length, rate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);
  for (let i = 0; i < length; i++) {
    const mist = (Math.random() * 2 - 1) * .15;
    left[i] = mist + (Math.random() * 2 - 1) * .19;
    right[i] = mist + (Math.random() * 2 - 1) * .19;
  }
  for (let drop = 0; drop < 1650; drop++) {
    const start = Math.floor(Math.random() * length);
    const duration = .007 + Math.random() * .031;
    const decay = Math.exp(-5 / (duration * rate));
    const pitch = (900 + Math.random() * 2800) * 2 * Math.PI / rate;
    const pan = .12 + Math.random() * .76;
    let envelope = .10 + Math.random() ** 2 * .40;
    for (let i = 0; i < duration * rate; i++) {
      const index = (start + i) % length;
      const attack = Math.min(1, i / (rate * .0011));
      const impact = envelope * attack * (.72 * (Math.random() * 2 - 1) + .28 * Math.sin(pitch * i));
      left[index] += impact * (1 - pan);
      right[index] += impact * pan;
      envelope *= decay;
    }
  }
  return buffer;
}

export function prepareSound() {
  const ocean = new Audio(oceanUrl);
  ocean.preload = "auto";
  ocean.loop = true;
  // Begin on the first full swell. Subsequent loops use the whole recording.
  ocean.currentTime = 7.8;

  // The storm recording starts with its first distant rumble, then rolls on
  // through the rest of the squall.
  const thunder = new Audio(thunderUrl);
  thunder.preload = "auto";
  thunder.loop = true;

  const splashData = preloadEffect(splashUrl);
  const foldData = preloadEffect(foldUrl);
  const pullData = preloadEffect(chainPullUrl);
  const breakData = preloadEffect(chainBreakUrl);
  const flashData = preloadEffect(flashUrl);
  let flashBuffer: AudioBuffer | undefined;
  let pullBuffer: AudioBuffer | undefined;
  let breakBuffer: AudioBuffer | undefined;
  let pulling: AudioBufferSourceNode | undefined;
  let foldBuffer: AudioBuffer | undefined;
  let unfoldBuffer: AudioBuffer | undefined;
  let splashBuffer: AudioBuffer | undefined;
  let splashGain: GainNode | undefined;
  let nextFold = 0;
  let nextPlaneFold = 0;
  let openedBoat = false;
  const paperSources = new Set<AudioBufferSourceNode>();
  let splash: AudioBufferSourceNode | undefined;
  let waterFilter: BiquadFilterNode | undefined;
  let audio: {
    context: AudioContext;
    output: DynamicsCompressorNode;
    master: GainNode;
  } | undefined;
  let masterVolume = 1;
  let surfGain: GainNode | undefined;
  let wind: { gain: GainNode; lowpass: BiquadFilterNode; stereo: StereoPannerNode } | undefined;
  let rain: { source: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | undefined;
  let rainBuffer: AudioBuffer | undefined;
  let creaseFilter: BiquadFilterNode | undefined;
  let stormGain: GainNode | undefined;
  let stormToken = 0;
  let spaceGain: GainNode | undefined;
  let spaceSources: AudioScheduledSourceNode[] = [];
  let spaceSubGain: GainNode | undefined;
  let spaceDroneGain: GainNode | undefined;
  let spaceFilter: BiquadFilterNode | undefined;
  let spaceRumbleGain: GainNode | undefined;
  let spaceHumGain: GainNode | undefined;
  let spaceWhine: OscillatorNode | undefined;
  let spaceWhineGain: GainNode | undefined;
  let spaceImpacted = false;
  let airBuffer: AudioBuffer | undefined;
  let lastHover = -1;
  let lastDepth = 0;
  const surfMix = 0.71 * 10 ** (-6 / 20); // An additional 6 dB cut to the ocean bed.
  const surfaceGain = 1.65 * surfMix;
  const surfaceHz = 20000;
  const submergedHz = 2400;
  const stormGainLevel = 0.42;

  const galleryTracks: { element: HTMLAudioElement; gain: GainNode }[] = [];

  function setupAudio() {
    if (!audio) {
      const context = new AudioContext({ latencyHint: "interactive" });
      const output = context.createDynamicsCompressor();
      const master = context.createGain();
      master.gain.value = masterVolume;
      output.threshold.value = -8;
      output.knee.value = 12;
      output.ratio.value = 5;
      output.attack.value = 0.004;
      output.release.value = 0.18;
      output.connect(master).connect(context.destination);
      audio = { context, output, master };
    }
    return audio;
  }

  const soundtrack = new Audio();
  soundtrack.loop = true;
  let scoreGain: GainNode | undefined;
  let scoreFilter: BiquadFilterNode | undefined;
  let scoreCue: keyof typeof scoreMix = "desk";
  // Each pair controls level and high-frequency detail in the same recording.
  const scoreMix = {
    desk: [.32, 3900], storm: [.44, 5200], submerged: [.36, 1700],
    flight: [.53, 15500], space: [.40, 7400], crane: [.33, 8600], rain: [.39, 3200], silent: [0, 5200],
  } as const;

  function score(cue: keyof typeof scoreMix) {
    scoreCue = cue;
    if (!audio || !scoreGain || !scoreFilter) return;
    const now = audio.context.currentTime;
    const [level, cutoff] = scoreMix[cue];
    const gain = scoreGain.gain;
    gain.cancelAndHoldAtTime(now);
    gain.linearRampToValueAtTime(level, now + (cue === "silent" ? .035 : 1.4));
    scoreFilter.frequency.setTargetAtTime(cutoff, now, .55);
  }

  function startScore() {
    const { context, output } = setupAudio();
    if (!scoreGain) {
      soundtrack.src = scoreUrl;
      scoreGain = context.createGain();
      scoreGain.gain.value = 0;
      scoreFilter = context.createBiquadFilter();
      scoreFilter.Q.value = .5;
      context.createMediaElementSource(soundtrack).connect(scoreFilter).connect(scoreGain).connect(output);
      score(scoreCue);
    }
    if (soundtrack.paused) void soundtrack.play().catch(() => {});
  }

  function stopPaper() {
    for (const source of paperSources) source.stop();
    paperSources.clear();
  }

  function playPaper(buffer: AudioBuffer, offset: number, length: number, duration: number,
    volume = 1, delay = 0, destination: AudioNode | undefined = waterFilter) {
    if (!destination || length <= 0 || duration <= 0) return;
    const context = destination.context;
    const start = context.currentTime + delay;
    const finish = start + duration;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = length * buffer.duration / duration;
    const gain = context.createGain();
    const fade = Math.min(0.028, duration * 0.25);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + fade);
    gain.gain.setValueAtTime(volume, finish - fade);
    gain.gain.linearRampToValueAtTime(0, finish);
    source.connect(gain).connect(destination);
    source.onended = () => {
      paperSources.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    paperSources.add(source);
    source.start(start, offset * buffer.duration, length * buffer.duration);
  }

  function stopWind(immediate = false) {
    if (!wind) return;
    const now = wind.gain.context.currentTime;
    wind.gain.gain.cancelScheduledValues(now);
    if (immediate) wind.gain.gain.setValueAtTime(0, now);
    else wind.gain.gain.setTargetAtTime(0, now, 0.22);
  }

  function stopRain() {
    if (!rain) return;
    const { source, gain } = rain;
    const now = gain.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0, now, .16);
    source.stop(now + .95);
    rain = undefined;
  }

  function resetStorm() {
    stormToken++;
    if (!stormGain) return;
    const now = stormGain.context.currentTime;
    stormGain.gain.cancelScheduledValues(now);
    stormGain.gain.setValueAtTime(0, now);
  }

  function fadeStorm(level: number, duration: number, pause: boolean) {
    if (!stormGain) return;
    const context = stormGain.context;
    const now = context.currentTime;
    const token = ++stormToken;
    stormGain.gain.cancelScheduledValues(now);
    stormGain.gain.setValueAtTime(stormGain.gain.value, now);
    if (level > 0) {
      // Restart at the first approaching rumble whenever the squall returns.
      try {
        thunder.currentTime = 0;
      } catch {}
      void thunder.play().catch(() => {});
      void (context as AudioContext).resume();
    }
    stormGain.gain.linearRampToValueAtTime(level, now + duration);
    if (!pause) return;
    window.setTimeout(() => {
      if (token === stormToken) thunder.pause();
    }, duration * 1000 + 150);
  }

  function startSpace(reduced: boolean) {
    if (!audio || spaceGain) return;
    const { context, output } = audio;
    const now = context.currentTime;
    const bus = context.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(0.94, now + (reduced ? 1.5 : 2.8));
    bus.connect(output);
    spaceGain = bus;
    const sources: AudioScheduledSourceNode[] = [];
    function tone(type: OscillatorType, frequency: number, volume: number, destination: AudioNode = bus) {
      const oscillator = context.createOscillator();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      const gain = context.createGain();
      gain.gain.value = volume;
      oscillator.connect(gain).connect(destination);
      oscillator.start(now);
      sources.push(oscillator);
      return { oscillator, gain };
    }
    // Keep the 120 and 180 Hz harmonics audible on small speakers.
    spaceHumGain = context.createGain();
    spaceHumGain.connect(bus);
    tone("sine", 60, 0.035, spaceHumGain);
    tone("sine", 120, 0.019, spaceHumGain);
    tone("sine", 180, 0.007, spaceHumGain);
    const drone = tone("sine", 36.7, 0.066);
    const sub = tone("triangle", 24.5, 0.045);
    spaceDroneGain = drone.gain;
    spaceSubGain = sub.gain;
    // A low harmonic stays audible on speakers that roll off the sub-bass.
    spaceRumbleGain = tone("sine", 73.4, 0).gain;
    if (airBuffer) {
      const noise = context.createBufferSource();
      noise.buffer = airBuffer;
      noise.loop = true;
      const low = context.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 95;
      low.Q.value = 0.8;
      const gain = context.createGain();
      gain.gain.value = 0.028;
      noise.connect(low).connect(gain).connect(bus);
      noise.start(now);
      sources.push(noise);
      spaceFilter = low;
    }
    const whine = tone("sine", 7400, 0.0026);
    spaceWhine = whine.oscillator;
    spaceWhineGain = whine.gain;
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(drone.gain.gain);
    lfo.start(now);
    sources.push(lfo);
    spaceSources = sources;
    spaceImpacted = false;
  }

  function setSpace(time: number, cameraDive: number) {
    if (!spaceGain) return;
    const context = spaceGain.context;
    const now = context.currentTime;
    const fall = smoothstep(10.3, 15.4, time);
    const tail = 1 - 0.70 * smoothstep(15.55, 17.9, time);
    if (spaceSubGain) spaceSubGain.gain.setTargetAtTime((0.044 + 0.24 * fall) * tail + 0.23 * cameraDive, now, 0.12);
    if (spaceDroneGain) spaceDroneGain.gain.setTargetAtTime((0.062 + 0.145 * fall) * tail + 0.14 * cameraDive, now, 0.15);
    spaceRumbleGain?.gain.setTargetAtTime(0.075 * fall * tail + 0.105 * cameraDive, now, 0.16);
    if (spaceFilter) spaceFilter.frequency.setTargetAtTime(95 + 240 * fall + 380 * cameraDive, now, 0.12);
    if (spaceHumGain) {
      spaceHumGain.gain.setTargetAtTime(1 - smoothstep(13.5, 15.5, time), now, 0.15);
    }
    if (spaceWhine) spaceWhine.frequency.setTargetAtTime(7400 - 5700 * fall, now, 0.12);
    if (spaceWhineGain) spaceWhineGain.gain.setTargetAtTime(0.0026 * (1 - fall), now, 0.15);
    if (!spaceImpacted && time >= 15.25) {
      spaceImpacted = true;
      void impact();
    }
  }

  function impact() {
    if (!audio) return;
    const { context, output } = audio;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(70, now);
    oscillator.frequency.exponentialRampToValueAtTime(22, now + 1.7);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.38, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
    oscillator.connect(gain).connect(output);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + 2.45);
  }

  function stopSpace(fade = 0.5) {
    if (!spaceGain) return;
    const bus = spaceGain;
    const sources = spaceSources;
    spaceGain = undefined;
    spaceSources = [];
    spaceSubGain = spaceDroneGain = spaceRumbleGain = spaceFilter = spaceHumGain = undefined;
    spaceWhine = undefined;
    spaceWhineGain = undefined;
    spaceImpacted = false;
    const now = bus.context.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setTargetAtTime(0, now, fade);
    window.setTimeout(() => {
      for (const node of sources) {
        try {
          node.stop();
        } catch {}
        node.disconnect();
      }
      bus.disconnect();
    }, fade * 1000 + 1000);
  }

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
    const volume = kind === "hover" ? 0.018 : kind === "title" ? 0.065 : 0.035;
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
    toneGain.gain.linearRampToValueAtTime(kind === "title" ? 0.025 : 0.017, now + 0.06);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    tone.connect(toneGain).connect(waterFilter);
    tone.onended = () => { tone.disconnect(); toneGain.disconnect(); };
    tone.start(now);
    tone.stop(now + duration);
  }

  return {
    setVolume(volume: number) {
      masterVolume = volume;
      if (!audio) return;
      audio.master.gain.setTargetAtTime(volume, audio.context.currentTime, .025);
    },
    cue,
    settleOcean() {
      if (!surfGain) return;
      const now = surfGain.context.currentTime;
      surfGain.gain.cancelScheduledValues(now);
      surfGain.gain.setTargetAtTime(1.45 * surfMix, now, 1.2);
    },
    storm(duration = 2.4) {
      fadeStorm(stormGainLevel, duration, false);
    },
    calmStorm(duration = 8.5) {
      fadeStorm(0, duration, true);
    },
    setSpace,
    endSpace(fade = 0.5) {
      stopSpace(fade);
    },
    score,
    startDesk() {
      score("desk");
      startScore();
      const { context } = setupAudio();
      void context.resume().catch(() => {});
    },
    start() {
      score("storm");
      startScore();
      const { context, output } = setupAudio();
      stopPaper();
      stopSpace(0.2);
      nextFold = nextPlaneFold = 0;
      openedBoat = false;
      if (waterFilter && surfGain) {
        lastDepth = 0;
        const now = context.currentTime;
        waterFilter.frequency.setValueAtTime(surfaceHz, now);
        surfGain.gain.cancelScheduledValues(now);
        surfGain.gain.setTargetAtTime(surfaceGain, now, 0.15);
        stopWind(true);
        // Unlock thunder playback inside the click gesture. The intro cues
        // the rumble once the journal begins to lift.
        resetStorm();
        if (stormGain) {
          try {
            thunder.currentTime = 0;
          } catch {}
          void thunder.play().catch(() => {});
        }
        void (waterFilter.context as AudioContext).resume();
        void ocean.play().catch(() => {});
        return;
      }
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = surfaceHz;
      filter.Q.value = -3;
      filter.connect(output);
      waterFilter = filter;
      // Prepare the airy accents once, away from camera and title transitions.
      // Prepare the loop during the opening so it is ready for the water entry.
      rainBuffer = createRainBuffer(context);
      airBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const air = airBuffer.getChannelData(0);
      for (let i = 0; i < air.length; i++) air[i] = Math.random() * 2 - 1;
      const breeze = context.createBufferSource();
      breeze.buffer = airBuffer;
      breeze.loop = true;
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 170;
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 1150;
      const gain = context.createGain();
      gain.gain.value = 0;
      const stereo = context.createStereoPanner();
      breeze.connect(highpass).connect(lowpass).connect(gain).connect(stereo).connect(output);
      breeze.start();
      wind = { gain, lowpass, stereo };

      creaseFilter = context.createBiquadFilter();
      creaseFilter.type = "highpass";
      creaseFilter.frequency.value = 430;
      creaseFilter.Q.value = 0.6;
      creaseFilter.connect(output);

      void flashData.then(async (data) => {
        if (data) flashBuffer = await context.decodeAudioData(data);
      }).catch(() => {});
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
      stormGain = context.createGain();
      stormGain.gain.value = 0;
      context.createMediaElementSource(thunder).connect(stormGain).connect(filter);
      void thunder.play().catch(() => {});
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
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      oscillator.connect(gain).connect(waterFilter);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now);
      oscillator.stop(now + 0.07);
    },
    unfold(fold: number, duration: number) {
      stopPaper();
      if (unfoldBuffer && fold > 0) playPaper(unfoldBuffer, 1 - fold, fold, duration * 0.68, 1, duration * 0.15);
    },
    openBoat(progress: number, duration: number) {
      if (openedBoat || !unfoldBuffer || !waterFilter || progress <= 0 || progress >= 1) return;
      openedBoat = true;
      playPaper(unfoldBuffer, progress, 1 - progress, duration * (1 - progress), 1.15);
    },
    fold(progress: number, duration: number) {
      if (!foldBuffer || progress <= 0 || progress >= 1 || progress < foldBoundaries[nextFold]) return;
      // At low frame rates, enter the current crease at its actual visual position.
      while (foldBoundaries[nextFold + 1] <= progress) nextFold++;
      const length = foldBoundaries[++nextFold] - progress;
      playPaper(foldBuffer, progress, length, duration * length);
    },
    craneRain(level: number, underwater: number) {
      if (!audio || level <= 0) return;
      const { context, output } = audio;
      const now = context.currentTime;
      if (!rain) {
        const source = context.createBufferSource();
        source.buffer = rainBuffer ??= createRainBuffer(context);
        source.loop = true;
        const highpass = context.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 310;
        const filter = context.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.value = 6900;
        filter.Q.value = .25;
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(highpass).connect(filter).connect(gain).connect(output);
        source.onended = () => {
          for (const node of [source, highpass, filter, gain]) node.disconnect();
        };
        source.start();
        rain = { source, gain, filter };
      }
      rain.filter.frequency.setTargetAtTime(6900 * (.088 ** underwater), now, .19);
      rain.gain.gain.setTargetAtTime(level * (.68 - .34 * underwater), now, .17);
    },
    museumOpening() {
      if (!audio || !waterFilter || !surfGain) return;
      const { context, output } = audio;
      if (!galleryTracks.length) {
        for (const [index, name] of ["birds", "voices"].entries()) {
          const element = new Audio(import.meta.env.BASE_URL + "museum/" + name + ".mp3");
          element.loop = true;
          const gain = context.createGain();
          gain.gain.value = 0;
          const pan = context.createStereoPanner();
          pan.pan.value = index === 0 ? .48 : -.38;
          context.createMediaElementSource(element).connect(gain).connect(pan).connect(output);
          galleryTracks.push({ element, gain });
        }
      }
      for (const { element, gain } of galleryTracks) {
        element.currentTime = 0;
        gain.gain.value = 0;
        void element.play().catch(() => {});
      }
      const now = context.currentTime;
      waterFilter.frequency.setTargetAtTime(12500, now, .2);
      surfGain.gain.cancelScheduledValues(now);
      surfGain.gain.setTargetAtTime(surfaceGain * .66, now, .3);
      surfGain.gain.setTargetAtTime(surfaceGain * .06, now + 3, 2.5);
      if (splashBuffer) {
        const splash = audio.context.createBufferSource();
        splash.buffer = splashBuffer;
        splash.connect(surfGain);
        splash.onended = () => splash.disconnect();
        splash.start(now);
      }
    },
    museumMix(progress: number) {
      if (!audio || !galleryTracks.length) return;
      const retreat = 1 - smoothstep(.55, .97, progress);
      const birds = smoothstep(.04, .26, progress) * (1 - .74 * smoothstep(.31, .51, progress));
      const voices = smoothstep(.19, .42, progress);
      galleryTracks[0].gain.gain.setTargetAtTime(.58 * birds * retreat, audio.context.currentTime, .16);
      galleryTracks[1].gain.gain.setTargetAtTime(.47 * voices * retreat, audio.context.currentTime, .16);
    },
    pauseMuseum(paused: boolean) {
      for (const { element } of galleryTracks) {
        if (paused) element.pause();
        else void element.play().catch(() => {});
      }
    },
    craneLanding(cue: number) {
      if (cue === 0) {
        fadeStorm(stormGainLevel, .65, false);
        if (audio && waterFilter && surfGain) {
          const now = audio.context.currentTime;
          waterFilter.frequency.setTargetAtTime(15500, now, .12);
          surfGain.gain.setTargetAtTime(surfaceGain, now, .28);
          void ocean.play().catch(()=>{});
        }
        stopPaper();
        if (foldBuffer && creaseFilter) playPaper(foldBuffer,.36,.34/foldBuffer.duration,.29,.78,0,creaseFilter);
      } else if (audio && waterFilter && surfGain) {
        const now=audio.context.currentTime;
        waterFilter.frequency.setTargetAtTime(640,now,.3);
        surfGain.gain.setTargetAtTime(surfaceGain*.48,now,.25);
        void ocean.play().catch(()=>{});
        if (splashBuffer) {
          const source=audio.context.createBufferSource(), gain=audio.context.createGain();
          source.buffer=splashBuffer;
          gain.gain.setValueAtTime(.24,now);
          gain.gain.exponentialRampToValueAtTime(.001,now+1.15);
          source.connect(gain).connect(waterFilter);
          source.onended=()=>{source.disconnect();gain.disconnect();};
          source.start(now,0,Math.min(1.2,splashBuffer.duration));
        }
      }
    },
    craneWing(beat: number, strength: number) {
      if (!foldBuffer || !creaseFilter) return;
      const downstroke = beat % 2 === 1;
      const seconds = downstroke ? 0.23 : 0.15;
      playPaper(foldBuffer, foldBoundaries[1 + beat % 5], seconds / foldBuffer.duration,
        seconds * (downstroke ? 1.04 : 0.94), strength * (downstroke ? 0.34 : 0.15), 0, creaseFilter);
    },
    foldPlane(progress: number, duration: number) {
      if (!foldBuffer || !creaseFilter || progress <= 0 || progress >= 1) return;
      while (nextPlaneFold < planeFoldSounds.length && progress >= planeFoldSounds[nextPlaneFold].start) {
        const { end, excerpt } = planeFoldSounds[nextPlaneFold++];
        const rate = 1.06;
        const offset = foldBoundaries[excerpt];
        const sampleLength = (foldBoundaries[excerpt + 1] - offset) * foldBuffer.duration;
        // Keep the transients near their recorded pitch. The paper stays
        // quiet for the remainder of a slow crease instead of stretching it.
        const seconds = Math.min(sampleLength / rate, duration * (end - progress));
        if (seconds < 0.045) continue;
        playPaper(foldBuffer, offset, seconds * rate / foldBuffer.duration, seconds, 0.59, 0, creaseFilter);
      }
    },
    newspaperFlash() {
      if (!audio || !flashBuffer) return;
      const { context, output } = audio;
      const source = context.createBufferSource();
      source.buffer = flashBuffer;
      const gain = context.createGain();
      gain.gain.value = 0.5;
      source.connect(gain).connect(output);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start();
    },
    dolphinBreath(pan: number, distance: number) {
      if (!audio || !airBuffer || audio.context.state !== "running") return;
      const { context, output } = audio;
      const now = context.currentTime;
      const exhaleEnd = now + 0.54;
      const inhaleStart = now + 0.60;
      const duration = 0.89;
      const source = context.createBufferSource();
      source.buffer = airBuffer;
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.Q.value = 0.65;
      highpass.frequency.setValueAtTime(650, now);
      highpass.frequency.setValueAtTime(1080, inhaleStart);
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.Q.value = 0.65;
      lowpass.frequency.setValueAtTime(4100, now);
      lowpass.frequency.exponentialRampToValueAtTime(2950, exhaleEnd);
      lowpass.frequency.setValueAtTime(2900, inhaleStart);
      lowpass.frequency.exponentialRampToValueAtTime(4900, now + 0.75);
      const envelope = context.createGain();
      const attenuation = 0.82 * Math.min(1, 32 / Math.max(1, distance)) ** 1.5;
      // The puff falls away. After a small gap, the intake swells upward
      // and closes quickly while the dolphin is still above the water.
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(0.29 * attenuation, now + 0.026);
      envelope.gain.linearRampToValueAtTime(0.20 * attenuation, now + 0.085);
      envelope.gain.linearRampToValueAtTime(0.11 * attenuation, now + 0.32);
      envelope.gain.linearRampToValueAtTime(0, exhaleEnd);
      envelope.gain.setValueAtTime(0, inhaleStart);
      envelope.gain.linearRampToValueAtTime(0.18 * attenuation, now + 0.76);
      envelope.gain.linearRampToValueAtTime(0, now + duration);
      const stereo = context.createStereoPanner();
      stereo.pan.value = Math.max(-0.85, Math.min(0.85, pan));
      source.connect(highpass).connect(lowpass).connect(envelope);
      envelope.connect(stereo).connect(output);
      source.onended = () => {
        for (const node of [source, highpass, lowpass, envelope, stereo]) node.disconnect();
      };
      source.start(now, Math.random() * (airBuffer.duration - duration), duration);
    },
    fly(speed: number, gust: number, crosswind: number, exposure: number) {
      if (!wind) return;
      const now = wind.gain.context.currentTime;
      const airflow = Math.min(1, speed / 7);
      const gustLevel = Math.max(-1, Math.min(1, gust));
      wind.gain.gain.setTargetAtTime(exposure * (0.155 + 0.135 * airflow + 0.055 * gustLevel), now, 0.15);
      wind.lowpass.frequency.setTargetAtTime(980 + 910 * airflow + 290 * gustLevel, now, 0.24);
      wind.stereo.pan.setTargetAtTime(0.22 * Math.max(-1, Math.min(1, crosswind)), now, 0.28);
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
      surfGain.gain.linearRampToValueAtTime(2.1 * surfMix, now + 2);
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
      for (const { element } of galleryTracks) element.pause();
      stopWind();
      stopRain();
      pulling?.stop();
      pulling = undefined;
      stopSpace(0.4);
      fadeStorm(0, 0.5, true);
      if (!surfGain || !waterFilter) return;
      const now = surfGain.context.currentTime;
      waterFilter.frequency.setTargetAtTime(surfaceHz, now, 0.08);
      surfGain.gain.cancelScheduledValues(now);
      surfGain.gain.setTargetAtTime(0, now, 0.3);
    },
    lightsOut() {
      stopWind(true);
      stopRain();
      ocean.pause();
      thunder.pause();
      resetStorm();
      stopPaper();
      if (!audio || !airBuffer) return;
      const { context, output } = audio;
      const now = context.currentTime;
      const snap = context.createBufferSource();
      snap.buffer = airBuffer;
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 1450;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      snap.connect(highpass).connect(gain).connect(output);
      snap.onended = () => { snap.disconnect(); highpass.disconnect(); gain.disconnect(); };
      snap.start(now, 0, 0.055);
    },
    startTelevision(reduced: boolean) {
      startSpace(reduced);
      if (!audio || !airBuffer) return;
      const { context, output } = audio;
      const now = context.currentTime;
      const duration = reduced ? 1.12 : 1.8;
      const noise = context.createBufferSource();
      noise.buffer = airBuffer;
      noise.loop = true;
      const speaker = context.createBiquadFilter();
      speaker.type = "bandpass";
      speaker.Q.value = 0.52;
      speaker.frequency.setValueAtTime(3500, now);
      speaker.frequency.exponentialRampToValueAtTime(1200, now + duration);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.29, now);
      gain.gain.exponentialRampToValueAtTime(0.095, now + 0.043);
      gain.gain.setValueAtTime(0.095, now + 0.55 * duration);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      noise.connect(speaker).connect(gain).connect(output);
      noise.onended = () => { noise.disconnect(); speaker.disconnect(); gain.disconnect(); };
      noise.start(now);
      noise.stop(now + duration);
    },
    takeoff(duration: number) {
      if (!surfGain) return;
      const now = surfGain.context.currentTime;
      surfGain.gain.cancelScheduledValues(now);
      surfGain.gain.setTargetAtTime(0.65 * surfMix, now, Math.max(0.35, duration * 0.28));
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
