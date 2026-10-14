// Body tracking with MediaPipe Pose Landmarker, entirely in the browser.
// The runtime (JS + WASM) comes from the pinned npm package and the model is
// cached by Mimic's own server, so everything loads from this origin.

const VENDOR = '/vendor/mediapipe';
const MODEL = '/vendor/model/pose_landmarker_lite.task';

let vision = null;
async function fileset() {
  if (!vision) {
    const mp = await import(`${VENDOR}/vision_bundle.mjs`);
    vision = { mp, files: await mp.FilesetResolver.forVisionTasks(`${VENDOR}/wasm`) };
  }
  return vision;
}

// One landmarker per use (extraction, live camera): each keeps its own
// monotonic clock, so two can't share an instance.
export async function createLandmarker() {
  const { mp, files } = await fileset();
  const opts = (delegate) => ({
    baseOptions: { modelAssetPath: MODEL, delegate },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  try {
    return await mp.PoseLandmarker.createFromOptions(files, opts('GPU'));
  } catch {
    // No usable WebGL (some laptops, headless browsers): the CPU path is slower but works.
    return mp.PoseLandmarker.createFromOptions(files, opts('CPU'));
  }
}

const pack = (lms) => lms.map((p) => [
  Math.round(p.x * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4,
  Math.round(p.z * 1e4) / 1e4, Math.round((p.visibility ?? 1) * 100) / 100,
]);

const seekTo = (video, t) => new Promise((resolve) => {
  const done = () => { video.removeEventListener('seeked', done); resolve(); };
  video.addEventListener('seeked', done);
  video.currentTime = t;
});

/**
 * Track the dancer through a whole video by stepping through it at a fixed
 * rate. Seeking frame by frame rather than playing means the result is the
 * same on a fast laptop and a slow one; nothing is skipped when it lags.
 * @returns {{fps, aspect, duration, frames: Array<{t, lm}>}}
 */
export async function trackVideo(video, { onProgress, signal } = {}) {
  if (video.readyState < 1) {
    await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      // A clip this browser can't decode (e.g. an iPhone HEVC .mov in desktop
      // Chrome) fires an error instead; say what to do rather than hang.
      video.addEventListener('error', () => reject(new Error(
        "This browser can't play this video's format. iPhone clips: open Mimic in Safari, or set Settings → Camera → Formats → Most Compatible and record again.",
      )), { once: true });
    });
  }
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('This video has no readable length.');
  const fps = duration > 120 ? 10 : 15;
  const landmarker = await createLandmarker();
  const frames = [];
  const total = Math.floor(duration * fps);
  try {
    for (let i = 0; i <= total; i++) {
      if (signal?.aborted) throw new Error('cancelled');
      const t = Math.min(duration - 0.001, i / fps);
      await seekTo(video, t);
      const res = landmarker.detectForVideo(video, Math.round(t * 1000) + 1);
      const lm = res.landmarks?.[0];
      if (lm) frames.push({ t: Math.round(t * 1000) / 1000, lm: pack(lm) });
      if (i % 5 === 0) onProgress?.(i / total, frames.length);
    }
  } finally {
    landmarker.close();
  }
  if (frames.length < Math.max(5, total * 0.1)) {
    throw new Error("Couldn't find a dancer in this video. Try a clip where one person is clearly in frame.");
  }
  return { fps, aspect: video.videoWidth / video.videoHeight || 16 / 9, duration, frames };
}

/**
 * Live tracking for the webcam. Call detect() as often as you like; it
 * returns the latest pose (or null) without ever blocking drawing.
 */
export async function createLiveTracker(video) {
  const landmarker = await createLandmarker();
  let last = -1;
  return {
    detect() {
      if (video.readyState < 2) return null;
      const now = Math.max(last + 1, Math.round(performance.now()));
      last = now;
      try {
        const lm = landmarker.detectForVideo(video, now).landmarks?.[0];
        return lm ? pack(lm) : null;
      } catch {
        return null; // a dropped frame; the next one will do
      }
    },
    close() { landmarker.close(); },
  };
}
