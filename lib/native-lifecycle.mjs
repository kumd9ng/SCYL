/**
 * Native lifecycle gate. Callbacks update state/pause only; this module never
 * starts playback. No App plugin code is loaded for an ordinary web visit.
 */
export function createNativeLifecycleController({
  isNativePlatform = () => globalThis.Capacitor?.isNativePlatform?.() === true,
  loadApp = async () => (await import('@capacitor/app')).App,
  onActiveChange = () => {}, onPause = () => {}, onError = () => {},
} = {}) {
  let active = false, ready = false, status = 'pending', reported = false;
  let epoch = 0, eventRevision = 0, disposed = false, native = false;
  let starting = null, disposing = null, lastError = null;
  const handles = new Set();
  const reportedErrors = new Set();
  const snapshot = () => ({ status, ready, isActive: active });
  const cancelled = () => Object.assign(new Error('Native lifecycle controller was disposed.'), { name: 'AbortError' });

  function report(error) {
    if (reportedErrors.has(error)) return;
    reportedErrors.add(error);
    try { Promise.resolve(onError(error)).catch(() => {}); } catch {}
  }
  async function removeOwned() {
    const owned = [...handles]; handles.clear();
    const results = await Promise.allSettled(owned.map(handle => Promise.resolve().then(() => handle.remove())));
    return results.flatMap(result => result.status === 'rejected' ? [result.reason] : []);
  }
  function failClosed(error) {
    if (disposed || status === 'failed') return;
    lastError = error; status = 'failed'; ready = false; active = false; epoch++;
    // A failing consumer callback must not leave the playback gate open.
    try { Promise.resolve(onActiveChange(false)).catch(report); } catch (failure) { report(failure); }
    try { Promise.resolve(onPause('error')).catch(report); } catch (failure) { report(failure); }
    report(error);
    void removeOwned().then(errors => errors.forEach(report));
  }
  function notify(callback, value) {
    try {
      const completion = callback(value);
      if (completion && typeof completion.then === 'function') Promise.resolve(completion).catch(failClosed);
    } catch (error) { failClosed(error); }
  }
  function applyState(next, reason) {
    const changed = !reported || active !== next;
    active = next; reported = true;
    if (changed) notify(onActiveChange, next);
    if (!next && (changed || reason === 'pause')) notify(onPause, reason);
  }

  async function initialize() {
    const token = ++epoch;
    const current = () => !disposed && token === epoch;
    const assertCurrent = () => { if (!current()) throw lastError || cancelled(); };
    try {
      native = isNativePlatform() === true;
      if (!native) { active = true; ready = true; status = 'web'; return snapshot(); }
      active = false; ready = false; status = 'pending'; reported = false;
      eventRevision = 0; lastError = null; reportedErrors.clear();
      const app = await loadApp(); assertCurrent();
      if (typeof app?.addListener !== 'function' || typeof app?.getState !== 'function') {
        throw new Error('Native App lifecycle plugin is unavailable.');
      }
      const observe = (isActive, reason) => {
        if (!current()) return;
        eventRevision++;
        if (typeof isActive !== 'boolean') { failClosed(new Error('Native App returned an invalid activity state.')); return; }
        applyState(isActive, reason);
      };
      // Subscribe before reading state so a background event cannot be missed
      // while the initial native getState request is crossing the bridge.
      for (const [event, listener] of [
        ['appStateChange', state => observe(state?.isActive, 'appStateChange')],
        ['pause', () => observe(false, 'pause')],
      ]) {
        const handle = await app.addListener(event, listener);
        if (!handle || typeof handle.remove !== 'function') throw new Error('Native App did not return a listener handle.');
        handles.add(handle); assertCurrent();
      }
      const revisionBeforeRead = eventRevision;
      const initial = await app.getState(); assertCurrent();
      if (typeof initial?.isActive !== 'boolean') throw new Error('Native App returned an invalid initial activity state.');
      // A newer pause/state notification wins over a stale getState result.
      if (eventRevision === revisionBeforeRead) applyState(initial.isActive, 'initial');
      assertCurrent(); ready = true; status = 'ready';
      return snapshot();
    } catch (error) {
      if (!disposed) { epoch++; ready = false; active = false; status = 'failed'; lastError = error; }
      if (native && !disposed) {
        notify(onActiveChange, false); notify(onPause, 'initialization-error');
      }
      const errors = await removeOwned();
      const failure = errors.length ? new AggregateError([error, ...errors], 'Native lifecycle initialization and listener cleanup failed.', { cause: error }) : error;
      if (native && !disposed) report(failure);
      throw failure;
    }
  }

  function start() {
    if (disposed) return Promise.reject(cancelled());
    if (ready) return Promise.resolve(snapshot());
    if (starting) return starting;
    starting = initialize().finally(() => { starting = null; });
    return starting;
  }
  function dispose() {
    if (disposing) return disposing;
    disposed = true; epoch++; active = false; ready = false; status = 'disposed';
    if (native) { notify(onActiveChange, false); notify(onPause, 'dispose'); }
    disposing = (async () => {
      // A late addListener resolution still belongs to this controller and is
      // removed by initialization's cancellation path before disposal completes.
      if (starting) await starting.catch(() => {});
      const errors = await removeOwned();
      if (errors.length) throw new AggregateError(errors, 'Native lifecycle listener cleanup failed.');
      return snapshot();
    })();
    return disposing;
  }
  return { start, getState: snapshot, dispose };
}
