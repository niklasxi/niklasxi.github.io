// A low D pedal runs through the storm. Its flat second makes the opening
// uneasy, then F-sharp and wider voicings give the sunset room to breathe.
const chapters = {
  desk:      { chord: [38, 45, 51, 56], level: 0.115, cutoff: 295, pulse: 0.026, pace: 0.34, width: 0.45, motif: [51, 50], spacing: 4.5 },
  fold:      { chord: [38, 44, 51, 57], level: 0.159, cutoff: 335, pulse: 0.074, pace: 0.57, width: 0.55, motif: [56, 51], spacing: 3.2 },
  surface:   { chord: [38, 45, 51, 56], level: 0.181, cutoff: 365, pulse: 0.096, pace: 0.71, width: 0.55, motif: [], spacing: 0 },
  depth:     { chord: [38, 44, 51, 56], level: 0.170, cutoff: 230, pulse: 0.085, pace: 0.58, width: 0.48, motif: [51, 44], spacing: 3.8 },
  release:   { chord: [38, 46, 51, 57], level: 0.193, cutoff: 480, pulse: 0.145, pace: 1.35, width: 0.68, motif: [58, 57], spacing: 2.2 },
  drift:     { chord: [38, 45, 54, 64], level: 0.157, cutoff: 895, pulse: 0.012, pace: 0.36, width: 1.15, motif: [69, 66, 64], spacing: 3.9 },
  ascent:    { chord: [38, 50, 57, 66], level: 0.168, cutoff: 1090, pulse: 0.040, pace: 0.59, width: 1.24, motif: [66, 69, 73], spacing: 3.1 },
  planeFold: { chord: [38, 45, 57, 66], level: 0.145, cutoff: 1035, pulse: 0.046, pace: 0.77, width: 1.18, motif: [69, 66], spacing: 3.6 },
  flight:    { chord: [38, 45, 66, 76], level: 0.165, cutoff: 1430, pulse: 0.010, pace: 0.34, width: 1.35, motif: [74, 69, 76], spacing: 3.1 },
  lastLight: { chord: [38, 45, 55, 64], level: 0.160, cutoff: 1100, pulse: 0.009, pace: 0.38, width: 1.30, motif: [69, 71], spacing: 4.1 },
  space:     { chord: [38, 45, 51, 65], level: 0.192, cutoff: 735, pulse: 0.030, pace: 0.35, width: 1, motif: [74, 65, 63], spacing: 3.3 },
  fall:      { chord: [38, 44, 51, 56], level: 0.228, cutoff: 445, pulse: 0.135, pace: 1.18, width: 1, motif: [68, 63, 62], spacing: 1.8 },
  end:       { chord: [38, 45, 52, 62], level: 0.072, cutoff: 430, pulse: 0, pace: 0.32, width: 1, motif: [], spacing: 0 },
} as const;

export type ScoreCue = keyof typeof chapters;

const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);
const noteSpacing = [1, 0.72, 1.55];
const stormCues = new Set<ScoreCue>(["fold", "surface", "depth", "release"]);

export function createScore(context: AudioContext, output: AudioNode) {
  const bus = context.createGain();
  bus.gain.value = 0;
  bus.connect(output);

  const pad = context.createBiquadFilter();
  pad.type = "lowpass";
  pad.frequency.value = 500;
  pad.connect(bus);
  const glide = context.createOscillator();
  glide.frequency.value = 0.13;
  glide.start();
  function voice(type: OscillatorType, note: number, volume: number, pan: number, detune: number) {
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency(note);
    osc.detune.value = detune;
    const gain = context.createGain();
    gain.gain.value = volume;
    const stereo = context.createStereoPanner();
    stereo.pan.value = pan;
    osc.connect(gain).connect(stereo).connect(pad);
    osc.start();
    return { osc, stereo, pan };
  }

  const padVoices = [
    [voice("triangle", 38, 0.27, -0.14, -2), voice("sine", 38, 0.19, 0.16, 3)],
    [voice("triangle", 45, 0.23, -0.49, 2)],
    [voice("triangle", 53, 0.16, 0.42, -4)],
    [voice("sine", 64, 0.16, -0.19, 4), voice("sine", 64, 0.08, 0.51, -6)],
  ];
  const bowDrift = context.createGain();
  bowDrift.gain.value = 3.5;
  glide.connect(bowDrift);
  bowDrift.connect(padVoices[2][0].osc.detune);
  bowDrift.connect(padVoices[3][1].osc.detune);

  // The recorded weather opens this voice. Its E-flat beats against the D
  // pedal, adding tension only while a rumble is actually passing.
  const stormTone = context.createOscillator();
  stormTone.type = "triangle";
  stormTone.frequency.value = frequency(39);
  const stormLevel = context.createGain();
  stormLevel.gain.value = 0;
  stormTone.connect(stormLevel).connect(pad);
  stormTone.start();
  let stormStrength = 0;
  function setStorm(amount: number, now: number) {
    stormLevel.gain.setTargetAtTime(0.48 * amount, now, amount > stormStrength ? 0.07 : 0.30);
    stormStrength = amount;
  }

  const pulse = context.createOscillator();
  pulse.type = "triangle";
  pulse.frequency.value = frequency(38);
  const tremolo = context.createOscillator();
  tremolo.frequency.value = 0.4;
  const modulation = context.createGain();
  modulation.gain.value = 0.49;
  const pulseShape = context.createGain();
  pulseShape.gain.value = 0.5;
  const pulseLevel = context.createGain();
  pulseLevel.gain.value = 0;
  tremolo.connect(modulation).connect(pulseShape.gain);
  pulse.connect(pulseShape).connect(pulseLevel).connect(pad);
  tremolo.start();
  pulse.start();

  const motif = context.createGain();
  motif.connect(bus);
  const echo = context.createDelay(0.75);
  echo.delayTime.value = 0.43;
  const echoFilter = context.createBiquadFilter();
  echoFilter.type = "lowpass";
  echoFilter.frequency.value = 780;
  const echoLevel = context.createGain();
  echoLevel.gain.value = 0.24;
  motif.connect(echo).connect(echoFilter).connect(echoLevel);
  echoLevel.connect(echo);
  echoLevel.connect(bus);

  let cue: ScoreCue | undefined;
  let noteIndex = 0;
  let timer = 0;

  function playNote(note: number, pan: number, now: number) {
    const envelope = context.createGain();
    const stereo = context.createStereoPanner();
    stereo.pan.value = pan;
    envelope.connect(stereo).connect(motif);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.17, now + 0.075);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
    const fundamental = context.createOscillator();
    const overtone = context.createOscillator();
    const overtoneGain = context.createGain();
    fundamental.frequency.value = frequency(note);
    overtone.frequency.value = fundamental.frequency.value * 2.01;
    overtoneGain.gain.setValueAtTime(0.21, now);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.73);
    overtone.connect(overtoneGain).connect(envelope);
    fundamental.connect(envelope);
    overtone.start(now);
    fundamental.start(now);
    overtone.stop(now + 0.75);
    fundamental.stop(now + 2.65);
    fundamental.onended = () => {
      fundamental.disconnect();
      overtone.disconnect();
      overtoneGain.disconnect();
      envelope.disconnect();
      stereo.disconnect();
    };
  }

  function nextNote() {
    if (!cue) return;
    const { motif: notes, spacing, width } = chapters[cue];
    if (!notes.length) return;
    if (!document.hidden && context.state === "running") {
      const index = noteIndex % notes.length;
      playNote(notes[index], (index % 2 ? 0.34 : -0.34) * width, context.currentTime + 0.015);
      noteIndex++;
    }
    timer = window.setTimeout(nextNote, 1000 * spacing * noteSpacing[noteIndex % noteSpacing.length]);
  }

  return {
    play(next: ScoreCue) {
      if (cue === next) return;
      const wasSilent = cue === undefined;
      cue = next;
      const now = context.currentTime;
      const { chord, level, cutoff, pulse: amount, pace, width, motif: notes } = chapters[next];
      padVoices.forEach((pair, i) => {
        for (const { osc, stereo, pan } of pair) {
          osc.frequency.setTargetAtTime(frequency(chord[i]), now, 0.24);
          stereo.pan.setTargetAtTime(pan * width, now, 0.65);
        }
      });
      if (!stormCues.has(next)) setStorm(0, now);
      motif.gain.setTargetAtTime(0.48 + 0.43 * width, now, 0.55);
      echoLevel.gain.setTargetAtTime(0.12 + 0.14 * width, now, 0.65);
      pad.frequency.setTargetAtTime(cutoff, now, 0.38);
      pulse.frequency.setTargetAtTime(frequency(chord[0]), now, 0.24);
      tremolo.frequency.setTargetAtTime(pace, now, 0.55);
      pulseLevel.gain.setTargetAtTime(amount, now, 0.3);
      bus.gain.setTargetAtTime(level, now, wasSilent && next === "space" ? 0.82 : 0.45);
      window.clearTimeout(timer);
      noteIndex = 0;
      if (notes.length) timer = window.setTimeout(nextNote, next === "space" ? 1500 : 420);
    },
    reactToThunder(amount: number) {
      if (cue && stormCues.has(cue)) setStorm(amount, context.currentTime);
    },
    cut() {
      cue = undefined;
      window.clearTimeout(timer);
      const now = context.currentTime;
      setStorm(0, now);
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(0, now);
    },
  };
}
