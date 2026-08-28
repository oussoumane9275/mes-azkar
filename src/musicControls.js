// Native Android lock-screen / status-bar media controls (play, pause,
// previous, next) for Quran recitation. Plain navigator.mediaSession (used
// elsewhere in this app) does NOT reliably produce a real system media
// widget inside a Capacitor WebView the way it does in an actual Chrome tab
// — this Cordova plugin bridges to a genuine Android MediaSessionCompat +
// MediaStyle notification instead, which is what actually shows up on the
// lock screen.
let listening = false;

function hasPlugin() {
  return typeof window !== "undefined" && !!window.MusicControls;
}

// Every call into the native bridge is wrapped so a native-side hiccup can
// never throw back into JS and interrupt playback (audio.play() must always
// run regardless of whether the lock-screen widget itself succeeds).
function safeCall(fn) {
  try {
    fn();
  } catch (e) {
    // native bridge failed — lock-screen widget just won't show/update
  }
}

export function showMusicControls({ title, artist, isPlaying, hasPrev, hasNext }) {
  if (!hasPlugin()) return;
  safeCall(() =>
    window.MusicControls.create(
      {
        track: title || "",
        artist: artist || "",
        cover: "icons/icon-512.png",
        isPlaying: !!isPlaying,
        hasPrev: !!hasPrev,
        hasNext: !!hasNext,
        hasClose: false,
        dismissable: false,
      },
      () => {},
      () => {}
    )
  );
}

export function setMusicControlsPlaying(isPlaying) {
  if (!hasPlugin()) return;
  safeCall(() => window.MusicControls.updateIsPlaying(!!isPlaying, () => {}, () => {}));
}

export function hideMusicControls() {
  if (!hasPlugin()) return;
  safeCall(() => window.MusicControls.destroy(() => {}, () => {}));
}

// Registers the native button handlers exactly once — safe to call from a
// mount-only effect since it just replaces the plugin's own internal
// callback reference each time, and re-subscribing doesn't add duplicate
// native listeners (only `listen()` does that, guarded below).
export function subscribeMusicControls({ onPlay, onPause, onNext, onPrev, onToggle }) {
  if (!hasPlugin()) return;
  safeCall(() => {
    window.MusicControls.subscribe((action) => {
      let message;
      try {
        message = JSON.parse(action).message;
      } catch (e) {
        return;
      }
      if (message === "music-controls-play" || message === "music-controls-media-button-play") onPlay && onPlay();
      else if (message === "music-controls-pause" || message === "music-controls-media-button-pause") onPause && onPause();
      else if (message === "music-controls-next" || message === "music-controls-media-button-next") onNext && onNext();
      else if (message === "music-controls-previous" || message === "music-controls-media-button-previous") onPrev && onPrev();
      else if (message === "music-controls-toggle-play-pause" || message === "music-controls-media-button-play-pause")
        onToggle && onToggle();
    });
    if (!listening) {
      window.MusicControls.listen();
      listening = true;
    }
  });
}
