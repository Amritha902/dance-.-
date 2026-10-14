// The body model. MediaPipe Pose gives 33 landmarks per frame, each
// [x, y, z, visibility] with x and y normalised to the frame (0..1).
// Everything else in Mimic — drawing, scoring, the coach — speaks in terms of
// the bones, limbs and joints defined here.

export const P = {
  nose: 0, lEar: 7, rEar: 8,
  lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16,
  lHip: 23, rHip: 24, lKnee: 25, rKnee: 26, lAnkle: 27, rAnkle: 28,
  lHeel: 29, rHeel: 30, lToe: 31, rToe: 32,
};

// A landmark below this visibility is treated as not seen.
export const SEEN = 0.4;
export const seen = (p) => !!p && p[3] >= SEEN;

// The scored limbs. Each bone is [from, to]; a limb's direction is what the
// learner is judged on, so where you stand and how big you look don't matter.
export const LIMBS = [
  { name: 'left arm', bones: [[P.lShoulder, P.lElbow], [P.lElbow, P.lWrist]] },
  { name: 'right arm', bones: [[P.rShoulder, P.rElbow], [P.rElbow, P.rWrist]] },
  { name: 'left leg', bones: [[P.lHip, P.lKnee], [P.lKnee, P.lAnkle]] },
  { name: 'right leg', bones: [[P.rHip, P.rKnee], [P.rKnee, P.rAnkle]] },
  { name: 'torso', bones: [[P.lShoulder, P.rShoulder], [P.lHip, P.rHip], [P.lShoulder, P.lHip], [P.rShoulder, P.rHip]] },
];

// What gets drawn: the scored bones plus feet, each tagged with its limb so a
// wrong limb can be painted as a unit.
export const BONES = [
  ...LIMBS.flatMap((l) => l.bones.map(([a, b]) => ({ a, b, limb: l.name }))),
  { a: P.lAnkle, b: P.lToe, limb: 'left leg' },
  { a: P.rAnkle, b: P.rToe, limb: 'right leg' },
];

// Joints as [end, vertex, end]; the angle at the vertex is what the coach reads.
export const JOINTS = {
  'left elbow': [P.lShoulder, P.lElbow, P.lWrist],
  'right elbow': [P.rShoulder, P.rElbow, P.rWrist],
  'left shoulder': [P.lHip, P.lShoulder, P.lElbow],
  'right shoulder': [P.rHip, P.rShoulder, P.rElbow],
  'left hip': [P.lShoulder, P.lHip, P.lKnee],
  'right hip': [P.rShoulder, P.rHip, P.rKnee],
  'left knee': [P.lHip, P.lKnee, P.lAnkle],
  'right knee': [P.rHip, P.rKnee, P.rAnkle],
};

// Left/right pairs across all 33 landmarks (face, hands and feet included).
const SIDES = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10], [11, 12], [13, 14], [15, 16],
  [17, 18], [19, 20], [21, 22], [23, 24], [25, 26], [27, 28], [29, 30], [31, 32]];

// A mirror image, the way a studio mirror shows it: x is reflected AND the two
// sides of the body swap names. Reflecting x alone would leave the dancer's
// left arm labelled "left" on the right of the screen, and a learner copying
// face-to-face — answering with their own right arm — would be scored as
// using the wrong limb.
export function mirror(lm) {
  if (!lm) return lm;
  const out = lm.map(([x, y, z, v]) => [1 - x, y, z, v]);
  for (const [a, b] of SIDES) [out[a], out[b]] = [out[b], out[a]];
  return out;
}
