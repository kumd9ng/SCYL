export const WAVEFORM_VIEW_SECONDS = 24;
const clamp = (value, maximum) => Math.max(0, Math.min(maximum, value));

export function waveformDragPosition({ position, deltaX, width, duration, viewSeconds = WAVEFORM_VIEW_SECONDS }) {
  if (![position, deltaX, width, duration, viewSeconds].every(Number.isFinite) || width <= 0 || duration < 0 || viewSeconds <= 0) {
    throw new RangeError('A finite position, positive waveform width and valid duration are required.');
  }
  return clamp(position - deltaX / width * viewSeconds, duration);
}
export function waveformKeyPosition({ key, position, duration, step = 5 }) {
  if (![position, duration, step].every(Number.isFinite) || duration < 0 || step <= 0) throw new RangeError('Invalid keyboard transport range.');
  if (key === 'Home') return 0;
  if (key === 'End') return duration;
  if (key === 'ArrowLeft') return clamp(position - step, duration);
  if (key === 'ArrowRight') return clamp(position + step, duration);
  return null;
}

/** One waveform controls the existing two-deck timeline, never either rate alone. */
export function createWaveformTransport({
  element, getEngine, getIdentity = () => getEngine(), canSeek = () => true,
  prepare = engine => engine.snapshot(), onBegin = () => {}, onChange = () => {},
  onResume = () => {}, onError = () => {}, threshold = 8,
} = {}) {
  if (!element?.addEventListener || typeof getEngine !== 'function') throw new TypeError('A waveform element and audio engine accessor are required.');
  let session = null, epoch = 0, disposed = false, pendingResume = null;
  const fail = error => { try { onError(error); } catch {} };
  const valid = gesture => !disposed && gesture.epoch === epoch && getEngine() === gesture.engine && getIdentity() === gesture.identity && canSeek();
  function release(gesture) {
    element.classList.remove('is-seeking');
    if (gesture?.pointerId !== undefined && element.hasPointerCapture?.(gesture.pointerId)) {
      try { element.releasePointerCapture(gesture.pointerId); } catch {}
    }
  }
  function cancel() {
    epoch++; pendingResume = null;
    const previous = session; session = null; release(previous);
    if (previous?.active) {
      try { onChange({ seeking: false, cancelled: true, snapshot: previous.engine.snapshot() }); } catch (error) { fail(error); }
    }
  }
  function snapshotForSeek() {
    if (disposed || !canSeek()) return null;
    const engine = getEngine(); if (!engine) return null;
    let snapshot = engine.snapshot();
    if (!(snapshot.duration > 0)) snapshot = prepare(engine);
    if (!(snapshot?.duration > 0)) return null;
    return { engine, snapshot, identity: getIdentity() };
  }
  function activate(gesture) {
    if (!valid(gesture)) { cancel(); return false; }
    const snapshot = gesture.engine.snapshot();
    gesture.position = snapshot.position; gesture.duration = snapshot.duration;
    gesture.wasPlaying = snapshot.state === 'playing' || gesture.continuedPlayback === true || Boolean(pendingResume?.engine === gesture.engine);
    pendingResume = null; gesture.active = true;
    onBegin(); gesture.engine.pause();
    if (!valid(gesture)) { cancel(); return false; }
    element.classList.add('is-seeking');
    element.focus?.({ preventScroll: true });
    if (gesture.pointerId !== undefined) { try { element.setPointerCapture(gesture.pointerId); } catch {} }
    return true;
  }
  function move(gesture, clientX) {
    if (!valid(gesture)) { cancel(); return false; }
    const target = waveformDragPosition({ position: gesture.position, deltaX: clientX - gesture.x, width: gesture.width, duration: gesture.duration });
    const snapshot = gesture.engine.seek(target);
    if (!valid(gesture)) { cancel(); return false; }
    onChange({ seeking: true, snapshot }); return true;
  }
  function complete(gesture, snapshot) {
    session = null; release(gesture);
    onChange({ seeking: false, snapshot });
    if (!gesture.wasPlaying || snapshot.state !== 'paused' || !valid(gesture)) return;
    pendingResume = gesture;
    try {
      Promise.resolve(onResume(gesture.engine, () => valid(gesture))).catch(fail).finally(() => {
        if (pendingResume === gesture) pendingResume = null;
      });
    } catch (error) { pendingResume = null; fail(error); }
  }
  function pointerDown(event) {
    if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    try {
      const previousResume = pendingResume;
      cancel();
      const available = snapshotForSeek(); if (!available) return;
      const width = element.getBoundingClientRect().width;
      if (!(width > 0)) return;
      const continuedPlayback = previousResume?.engine === available.engine && previousResume.identity === available.identity;
      session = { ...available, epoch, pointerId: event.pointerId, x: event.clientX, y: event.clientY, width, active: false, continuedPlayback };
    } catch (error) { cancel(); fail(error); }
  }
  function pointerMove(event) {
    const gesture = session;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    try {
      if (!valid(gesture)) { cancel(); return; }
      if (!gesture.active) {
        const dx = Math.abs(event.clientX - gesture.x), dy = Math.abs(event.clientY - gesture.y);
        if (dy >= threshold && dy >= dx) { cancel(); return; }
        if (dx < threshold || dx <= dy * 1.2 || !activate(gesture)) return;
      }
      event.preventDefault(); move(gesture, event.clientX);
    } catch (error) { cancel(); fail(error); }
  }
  function pointerUp(event) {
    const gesture = session;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    try {
      if (!gesture.active) { cancel(); return; }
      event.preventDefault();
      if (!move(gesture, event.clientX)) return;
      complete(gesture, gesture.engine.snapshot());
    } catch (error) { cancel(); fail(error); }
  }
  function pointerCancel(event) { if (session?.pointerId === event.pointerId) cancel(); }
  function keyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    try {
      const available = snapshotForSeek(); if (!available) return;
      event.preventDefault();
      const continuedPlayback = pendingResume?.engine === available.engine;
      cancel();
      const gesture = { ...available, epoch, active: false };
      session = gesture;
      if (!activate(gesture)) return;
      gesture.wasPlaying ||= continuedPlayback;
      const target = waveformKeyPosition({ key: event.key, position: gesture.position, duration: gesture.duration });
      const snapshot = gesture.engine.seek(target);
      if (!valid(gesture)) { cancel(); return; }
      complete(gesture, snapshot);
    } catch (error) { cancel(); fail(error); }
  }
  const listeners = [['pointerdown', pointerDown], ['pointermove', pointerMove], ['pointerup', pointerUp], ['pointercancel', pointerCancel], ['lostpointercapture', pointerCancel], ['keydown', keyDown]];
  for (const [name, listener] of listeners) element.addEventListener(name, listener, { passive: false });
  function dispose() {
    cancel(); disposed = true;
    for (const [name, listener] of listeners) element.removeEventListener(name, listener);
  }
  return { cancel, dispose, isSeeking: () => Boolean(session?.active) };
}
