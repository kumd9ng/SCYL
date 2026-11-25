import { createNativeLifecycleController } from './native-lifecycle.mjs';

/**
 * A gate for decoded-file playback. This adapter never resumes an AudioContext
 * or starts an audio engine: a visible, explicit user action owns that work.
 */
export function createFilePlaybackLifecycle({
  isNativePlatform = () => globalThis.Capacitor?.isNativePlatform?.() === true,
  isHidden = () => globalThis.document?.hidden === true,
  createNativeController = createNativeLifecycleController,
  onInterrupt = () => {}, onError = () => {},
} = {}) {
  let nativeController = null, starting = null, epoch = 0;
  let ready = false, active = false, failed = false, disposed = false;
  let context = null, listening = false, observedAudioState = null;
  const reported = new Set();
  const getState = () => ({ ready, isActive: active, failed, contextState: context?.state ?? null });
  const canRequestPlayback = () => !disposed && ready && active && !failed && !isHidden() && context?.state !== 'closed';
  const canPlay = () => canRequestPlayback() && context?.state === 'running';
  function report(error) {
    if (reported.has(error)) return;
    reported.add(error);
    try { Promise.resolve(onError(error)).catch(() => {}); } catch {}
  }
  function interrupt(reason) {
    try { onInterrupt(reason); }
    catch (error) { ready = false; active = false; failed = true; report(error); }
  }
  function fail(error) {
    ready = false; active = false; failed = true;
    interrupt('native-error'); report(error);
  }
  function audioStateChanged() {
    const next = context?.state;
    if (next === observedAudioState) return;
    observedAudioState = next;
    if (['suspended', 'interrupted', 'closed'].includes(next)) interrupt(`audio-${next}`);
    // A return to running must not restart sources stopped by an interruption.
  }
  function unbindAudio() {
    if (context && listening) context.removeEventListener('statechange', audioStateChanged);
    listening = false;
  }
  function bindAudio() {
    if (!context || listening || disposed) return;
    observedAudioState = context.state;
    context.addEventListener('statechange', audioStateChanged); listening = true;
  }
  function setContext(next) {
    if (disposed) throw new Error('File playback lifecycle is disposed.');
    if (next && (typeof next.addEventListener !== 'function' || typeof next.removeEventListener !== 'function')) {
      throw new TypeError('An AudioContext with statechange events is required.');
    }
    if (context === next) { bindAudio(); return; }
    unbindAudio(); context = next; bindAudio();
  }
  function start() {
    if (disposed) return Promise.reject(new Error('File playback lifecycle is disposed.'));
    if (starting) return starting;
    if (ready && nativeController) return Promise.resolve(getState());
    bindAudio(); ready = false; active = false; failed = false; reported.clear();
    const token = ++epoch;
    const current = () => !disposed && token === epoch;
    let controller;
    try {
      controller = createNativeController({
        isNativePlatform,
        onActiveChange(value) { if (current()) active = value; },
        onPause(reason) { if (current()) interrupt(`native-${reason}`); },
        onError(error) { if (current()) fail(error); },
      });
      nativeController = controller;
      starting = Promise.resolve(controller.start()).then(() => {
        if (!current()) return getState();
        const state = controller.getState();
        ready = state.ready && !failed; active = ready && state.isActive;
        return getState();
      }).catch(error => {
        if (current()) fail(error);
        throw error;
      }).finally(() => { if (current()) starting = null; });
      return starting;
    } catch (error) { fail(error); return Promise.reject(error); }
  }
  function visibilityChanged() { if (isHidden()) interrupt('hidden'); }
  function stop() {
    epoch++; ready = false; active = false; starting = null;
    const previous = nativeController; nativeController = null;
    interrupt('pagehide'); unbindAudio();
    return Promise.resolve().then(() => previous?.dispose()).catch(error => { report(error); throw error; });
  }
  function dispose() {
    if (disposed) return Promise.resolve();
    disposed = true;
    return stop().finally(() => { context = null; });
  }
  return { start, stop, dispose, setContext, visibilityChanged, canRequestPlayback, canPlay, getState };
}
