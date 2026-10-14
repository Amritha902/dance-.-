// The coach's library: short corrections a dance teacher would say out loud.
// Each entry fixes one kind of joint error. `joint` is the joint family,
// `fault` the direction of the error (see readJoint in agent.js), `tags` extra
// words the retriever can match on. Add entries freely; nothing else changes.

export const CUES = [
  // elbows: 180° = straight
  { id: 'elbow-soften', joint: 'elbow', fault: 'too_straight', tags: ['arm', 'locked'],
    say: 'Soften the elbow: keep a slight bend, like you\'re carrying a tray.',
    why: 'Locked arms look stiff and lose the shape of the move.' },
  { id: 'elbow-fold', joint: 'elbow', fault: 'too_straight', tags: ['arm', 'pull'],
    say: 'Fold the arm in toward your chest on that count, then send it back out.',
    why: 'Most arm hits travel through a bent arm before they extend.' },
  { id: 'elbow-reach', joint: 'elbow', fault: 'too_bent', tags: ['arm', 'extend'],
    say: 'Reach all the way to your fingertips: finish the line.',
    why: 'Stopping short of full extension makes big moves look small.' },
  { id: 'elbow-wall', joint: 'elbow', fault: 'too_bent', tags: ['arm', 'target'],
    say: 'Pretend you\'re pressing a wall an arm\'s length away.',
    why: 'An outside target straightens the arm without thinking about the joint.' },

  // shoulders: bigger angle = arm raised higher
  { id: 'arm-lift', joint: 'shoulder', fault: 'too_low', tags: ['arm', 'height', 'tired'],
    say: 'Lift the elbow to shoulder height, not chest height.',
    why: 'Arms sink as you tire; height is what makes the shape readable.' },
  { id: 'arm-lift-back', joint: 'shoulder', fault: 'too_low', tags: ['arm', 'posture'],
    say: 'Lift from your back, and keep your neck long.',
    why: 'Lifting from the back keeps the shoulder from hunching up.' },
  { id: 'arm-lower', joint: 'shoulder', fault: 'too_high', tags: ['arm', 'height'],
    say: 'Bring the arm down to chest level. It\'s lower than it looks on screen.',
    why: 'People over-raise when copying from a screen above eye level.' },
  { id: 'shoulders-down', joint: 'shoulder', fault: 'too_high', tags: ['posture', 'tension'],
    say: 'Drop your shoulders away from your ears first, then place the arm.',
    why: 'Raised shoulders lift the whole arm with them.' },

  // hips: bigger angle = more upright
  { id: 'hip-sit', joint: 'hip', fault: 'too_straight', tags: ['level', 'groove'],
    say: 'Sit back into your hips, as if there\'s a stool behind you.',
    why: 'Grounded styles live in a folded hip; standing tall loses the groove.' },
  { id: 'hip-lean', joint: 'hip', fault: 'too_straight', tags: ['lean', 'chest'],
    say: 'Tip your chest forward over your toes on that count.',
    why: 'The forward lean is part of the shape, not a mistake.' },
  { id: 'hip-tall', joint: 'hip', fault: 'too_bent', tags: ['posture', 'chest'],
    say: 'Stand up through your chest and push your hips forward.',
    why: 'Folding too far reads as tired and hides the arms.' },

  // knees: 180° = straight
  { id: 'knee-bounce', joint: 'knee', fault: 'too_straight', tags: ['bounce', 'rhythm', 'locked'],
    say: 'Unlock your knees and keep a small bounce.',
    why: 'Straight legs kill the rhythm; the bounce is where the beat lives.' },
  { id: 'knee-level', joint: 'knee', fault: 'too_straight', tags: ['level', 'low'],
    say: 'Drop your level by a hand\'s width for this step.',
    why: 'Level changes are easy to miss on video but obvious on the stickman.' },
  { id: 'knee-push', joint: 'knee', fault: 'too_bent', tags: ['extend', 'standing leg'],
    say: 'Straighten the standing leg and push the floor away.',
    why: 'Staying crouched blurs the difference between high and low counts.' },
  { id: 'knee-kick', joint: 'knee', fault: 'too_bent', tags: ['kick', 'extend'],
    say: 'Kick through to a long leg, then pull it back in.',
    why: 'Full extension makes kicks and steps read clearly.' },

  // general
  { id: 'slow-first', joint: 'any', fault: 'any', tags: ['speed', 'practice'],
    say: 'Do it at half speed until the shape is right, then speed up.',
    why: 'Speed hides shape mistakes; slow practice fixes them.' },
  { id: 'watch-one-limb', joint: 'any', fault: 'any', tags: ['focus', 'practice'],
    say: 'Watch only that one limb on the stickman for a whole loop, then copy just it.',
    why: 'Fixing one limb at a time is faster than fixing everything at once.' },
];
