// MIDI voicings run from the bass note to the top of the chord. The melody can
// climb beyond the last voice into the next octave.
const harmony = {
  paper: [[38, 57, 60, 64, 65], [34, 53, 57, 60, 64], [41, 55, 57, 60, 64], [36, 55, 58, 62, 65]],
  deep: [[38, 53, 57, 58, 64], [39, 53, 58, 62, 65], [34, 53, 57, 60, 62], [33, 52, 55, 58, 61]],
  open: [[41, 57, 60, 64, 67], [36, 55, 59, 62, 64], [38, 53, 57, 60, 64], [34, 53, 57, 60, 65]],
  signal: [[35, 54, 57, 60, 64], [36, 55, 59, 61, 66], [32, 51, 55, 58, 62], [33, 52, 56, 58, 63]],
} as const;

type Figure = readonly (readonly [eighth: number, voice: number])[];
// Call and response over two bars. Pauses leave room for the physical sounds.
const figures = {
  ink:     [[0, 1], [3, 2], [6, 4], [10, 3], [14, 1]],
  ripple:  [[0, 2], [3, 4], [5, 3], [8, 1], [12, 2], [15, 4]],
  sonar:   [[0, 2], [7, 1], [12, 0]],
  climb:   [[0, 0], [2, 2], [5, 3], [7, 4], [9, 2], [11, 3], [14, 5]],
  wings:   [[0, 4], [3, 3], [6, 1], [9, 2], [13, 4]],
  wire:    [[0, 1], [3, 2], [4, 1], [9, 0], [11, 2], [15, 1]],
  closing: [[0, 3], [4, 1], [10, 2], [13, 0]],
} as const satisfies Record<string, Figure>;

const rhythms = {
  still: { bass: [0], rim: [] },
  tide:  { bass: [0, 5], rim: [3, 7] },
  step:  { bass: [0, 3, 6], rim: [2, 5, 7] },
  pull:  { bass: [0, 2, 4, 6], rim: [1, 3, 5, 7] },
  skip:  { bass: [0, 6], rim: [2, 5] },
} satisfies Record<string, { bass: number[]; rim: number[] }>;

type Mix = { keys: number; pad: number; bass: number; rim: number };
function arrange(chords: keyof typeof harmony, melody: keyof typeof figures, rhythm: keyof typeof rhythms,
  bpm: number, instrument: "tines" | "glass", mix: Mix) {
  return { chords: harmony[chords], melody: figures[melody], rhythm: rhythms[rhythm], bpm, instrument, mix };
}

export const arrangements = {
  desk:      arrange("paper", "ink",     "still", 68,  "tines", { keys: .19, pad: .020, bass: 0,    rim: 0 }),
  fold:      arrange("paper", "ripple",  "step",  88,  "tines", { keys: .14, pad: .033, bass: .09,  rim: .048 }),
  surface:   arrange("paper", "ripple",  "tide",  76,  "tines", { keys: .17, pad: .049, bass: .09,  rim: .022 }),
  depth:     arrange("deep",  "closing", "skip",  66,  "glass", { keys: .13, pad: .061, bass: .12,  rim: .018 }),
  anchored:  arrange("deep",  "sonar",   "still", 57,  "glass", { keys: .15, pad: .044, bass: .095, rim: 0 }),
  release:   arrange("deep",  "wire",    "pull",  120, "glass", { keys: .12, pad: .040, bass: .14,  rim: .065 }),
  drift:     arrange("open",  "ink",     "tide",  73,  "tines", { keys: .16, pad: .060, bass: .08,  rim: .018 }),
  ascent:    arrange("open",  "climb",   "step",  94,  "glass", { keys: .15, pad: .049, bass: .09,  rim: .033 }),
  sheet:     arrange("open",  "wings",   "still", 65,  "glass", { keys: .14, pad: .051, bass: 0,    rim: 0 }),
  planeFold: arrange("paper", "climb",   "step",  104, "tines", { keys: .14, pad: .022, bass: .08,  rim: .055 }),
  flight:    arrange("open",  "wings",   "tide",  88,  "tines", { keys: .18, pad: .067, bass: .11,  rim: .032 }),
  lastLight: arrange("deep",  "closing", "still", 58,  "tines", { keys: .15, pad: .063, bass: .075, rim: 0 }),
  space:     arrange("signal","wire",    "skip",  82,  "glass", { keys: .13, pad: .036, bass: .07,  rim: .046 }),
  tvFloat:   arrange("signal","sonar",   "still", 54,  "glass", { keys: .16, pad: .025, bass: .055, rim: 0 }),
  fall:      arrange("signal","closing", "step",  101, "glass", { keys: .13, pad: .050, bass: .14,  rim: .042 }),
  plunge:    arrange("deep",  "wire",    "pull",  116, "tines", { keys: .09, pad: .060, bass: .16,  rim: .056 }),
  crane:     arrange("open",  "ink",     "still", 61,  "tines", { keys: .17, pad: .016, bass: 0,    rim: 0 }),
  returning: arrange("paper", "closing", "still", 64,  "tines", { keys: .13, pad: .028, bass: 0,    rim: 0 }),
};
export type ScoreCue = keyof typeof arrangements;
