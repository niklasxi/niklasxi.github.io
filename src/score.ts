import { arrangements, type ScoreCue } from "./scoreArrangements";
export type { ScoreCue } from "./scoreArrangements";

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
type Instrument = "tines" | "glass" | "bass" | "pad" | "rim";

export function createScore(context: AudioContext, output: AudioNode) {
  const master = context.createGain();
  master.gain.value = .82;
  master.connect(output);
  const padWave = context.createPeriodicWave(new Float32Array(7), new Float32Array([0, 1, .29, .16, .06, .045, .02]));
  const voices = new Set<OscillatorNode>();
  const fading = new Set<GainNode>();
  let cue: ScoreCue | undefined;
  let section: GainNode | undefined;
  let timer = 0;
  let step = 0;
  let nextTime = 0;
  let startTime = 0;
  let transition = .5;
  let thunder = 0;
  let depth = 0;
  let lift = 0;

  function note(instrument: Instrument, pitch: number, time: number, duration: number, level: number, pan: number) {
    if (!section || level <= 0) return;
    const source = context.createOscillator();
    const envelope = context.createGain();
    const stereo = context.createStereoPanner();
    const frequency = hz(pitch);
    source.frequency.value = frequency;
    stereo.pan.value = pan;
    source.connect(envelope).connect(stereo).connect(section);
    const gain = envelope.gain;
    gain.setValueAtTime(0, time);
    const end = time + duration;
    let modulator: OscillatorNode | undefined;
    let modulation: GainNode | undefined;
    if (instrument === "tines" || instrument === "glass") {
      // The metallic attack dies before the pitched body, like a struck tine.
      const glass = instrument === "glass";
      modulator = context.createOscillator();
      modulation = context.createGain();
      modulator.frequency.value = frequency * (glass ? 2.71 : 1.003);
      modulation.gain.setValueAtTime(frequency * (glass ? 1.20 : 1.75) * (1 - .72 * depth), time);
      modulation.gain.exponentialRampToValueAtTime(frequency * .018, time + duration * .48);
      modulator.connect(modulation).connect(source.frequency);
      gain.linearRampToValueAtTime(level, time + .009);
      gain.exponentialRampToValueAtTime(level * .39, time + duration * .22);
      modulator.start(time);
      modulator.stop(end);
    } else if (instrument === "pad") {
      source.setPeriodicWave(padWave);
      source.detune.value = pan * 7;
      gain.linearRampToValueAtTime(level, time + duration * .22);
      gain.linearRampToValueAtTime(level * .82, time + duration * .75);
    } else {
      source.type = "triangle";
      source.frequency.setValueAtTime(frequency * (instrument === "rim" ? 1.92 : 1.22), time);
      source.frequency.exponentialRampToValueAtTime(frequency, time + duration * .17);
      gain.linearRampToValueAtTime(level, time + .005);
    }
    gain.exponentialRampToValueAtTime(.00001, end);
    voices.add(source);
    source.onended = () => {
      voices.delete(source);
      source.disconnect();
      envelope.disconnect();
      stereo.disconnect();
      modulator?.disconnect();
      modulation?.disconnect();
    };
    source.start(time);
    source.stop(end);
  }

  function renderStep(current: ScoreCue, time: number) {
    const part = arrangements[current];
    const beat = 60 / part.bpm;
    const bar = Math.floor(step / 8);
    const eighth = step % 8;
    const chord = part.chords[bar % part.chords.length];
    const { mix } = part;
    const air = current === "sheet" || current === "ascent" || current === "flight" ? lift : 0;
    const strain = current === "release" ? Math.min(1, (time - startTime) / transition) : 0;
    if (eighth === 0) {
      for (let voice = 1; voice <= 3; voice++) {
        note("pad", chord[voice], time + voice * .012, beat * 4.15,
          mix.pad * (.8 + air * .45), (voice - 2) * .62);
      }
    }
    const bassSteps: readonly number[] = part.rhythm.bass;
    if (bassSteps.includes(eighth)) {
      const bassPitch = chord[0] + (bar % 2 && eighth === 6 ? 7 : 0);
      note("bass", bassPitch, time, beat * (eighth ? .63 : 1.55),
        mix.bass * (eighth ? .70 : 1) * (1 + thunder * .22), 0);
    }
    const rimSteps: readonly number[] = part.rhythm.rim;
    if (rimSteps.includes(eighth)) {
      const accent = eighth === 2 || eighth === 5 ? 1 : .58;
      note("rim", 75 + (eighth % 3) * 3, time + .016, .085, mix.rim * accent, eighth % 2 ? .40 : -.28);
      if (strain > .44) note("rim", 83, time + beat * .25, .062, mix.rim * strain * .72, -.28);
    }
    for (const [onset, degree] of part.melody) {
      if (step % 16 !== onset) continue;
      // Answer the second four-bar phrase in another inversion.
      const index = degree + (bar % 8 >= 4 && onset >= 8 ? 1 : 0);
      const pitch = chord[1 + index % 4] + 12 * Math.floor(index / 4);
      const level = mix.keys * (eighth === 0 ? 1 : .79) * (1 - .22 * depth);
      note(part.instrument, pitch, time, beat * (eighth === 0 ? 2.7 : 1.6), level, -.17);
      note(part.instrument, pitch, time + beat * .75, beat * 1.35, level * .17, .56);
      if (air > .32) note("glass", pitch + 12, time + beat * .5, beat, level * air * .38, .44);
    }
  }

  function schedule() {
    if (!cue || document.hidden) return;
    if (context.state === "running") {
      const now = context.currentTime;
      nextTime = Math.max(nextTime, now + .012);
      while (nextTime < now + .15) {
        renderStep(cue, nextTime);
        step++;
        nextTime += 30 / arrangements[cue].bpm;
      }
    }
    timer = window.setTimeout(schedule, 55);
  }

  function visibilityChanged() {
    window.clearTimeout(timer);
    master.gain.setTargetAtTime(document.hidden ? 0 : .82, context.currentTime, .035);
    schedule();
  }

  return {
    play(next: ScoreCue, duration = .6) {
      if (next === cue) return;
      window.clearTimeout(timer);
      const now = context.currentTime;
      transition = Math.max(.1, duration);
      const fade = Math.min(.6, transition * .45);
      if (section) {
        const old = section;
        old.gain.setTargetAtTime(0, now, fade / 5);
        fading.add(old);
        window.setTimeout(() => { old.disconnect(); fading.delete(old); }, fade * 1000 + 30);
      }
      section = context.createGain();
      section.gain.setValueAtTime(.025, now);
      section.gain.setTargetAtTime(1, now, Math.min(.095, fade / 3));
      section.connect(master);
      if (!cue) document.addEventListener("visibilitychange", visibilityChanged);
      cue = next;
      step = 0;
      startTime = nextTime = now + .015;
      visibilityChanged();
    },
    reactToThunder(amount: number) { thunder = amount; },
    setDepth(amount: number) { depth = amount; },
    setLift(amount: number) { lift = amount; },
    cut() {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibilityChanged);
      section?.disconnect();
      for (const old of fading) old.disconnect();
      fading.clear();
      section = cue = undefined;
      thunder = depth = lift = 0;
      for (const voice of voices) voice.stop();
    },
  };
}
