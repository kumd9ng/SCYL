import { planMix, equalPowerGains } from './mix-planner.mjs';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, label) => { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`); return value; };
const EPSILON = 1e-7;

/**
 * Two decoded PCM tracks on one supplied AudioContext/OfflineAudioContext.
 * The caller resumes a real context in a user gesture. This engine never
 * resumes, suspends or closes that context, and never owns a polling timer.
 * playbackRate changes tempo AND pitch; no time-stretching is claimed.
 */
export function createAudioMixEngine({ context, masterGain = .65, scheduleAhead = .03, onState = () => {}, onAdvance = () => {}, onFinished = () => {}, onError = () => {} } = {}) {
  for (const method of ['createBufferSource', 'createGain', 'createBiquadFilter', 'createDelay']) {
    if (typeof context?.[method] !== 'function') throw new TypeError('A Web Audio context is required.');
  }
  finite(context.currentTime, 'AudioContext clock');
  if (!Number.isFinite(context.sampleRate) || context.sampleRate <= 0) throw new TypeError('A valid context sample rate is required.');
  const ahead = clamp(finite(scheduleAhead, 'Scheduling lead'), 0, .25);
  let volume = clamp(finite(masterGain, 'Master gain'), 0, 1);
  const master = context.createGain(); master.gain.value = volume; master.connect(context.destination);
  let tracks = [], entries = [], graphs = [], timelinePlan = null;
  let state = 'idle', cursor = 0, anchor = 0, duration = 0, generation = 0;
  let advanced = false, finished = false;
  const maxFilter = Math.min(20000, context.sampleRate * .475);
  const effects = [0, 1].map(() => ({ filterHz: maxFilter, echo: 0, echoDelay: .25, echoFeedback: .3 }));
  const alive = () => { if (state === 'disposed') throw new Error('Audio engine is disposed.'); };
  const clock = () => finite(context.currentTime, 'AudioContext clock');
  const position = () => entries.length && state === 'playing' ? clamp(Math.max(cursor, clock() - anchor), 0, duration) : cursor;

  function notify(callback, value) {
    try {
      const result = callback(value);
      if (result && typeof result.then === 'function') result.catch(error => { try { onError(error); } catch {} });
    } catch (error) { try { onError(error); } catch {} }
  }
  function progress(time) {
    if (!timelinePlan) return 0;
    return timelinePlan.fadeDuration > 0 ? clamp((time - timelinePlan.start) / timelinePlan.fadeDuration, 0, 1) : (time >= timelinePlan.start ? 1 : 0);
  }
  function envelope(index, time) {
    if (!timelinePlan) return index === 0 ? 1 : 0;
    const gains = equalPowerGains(progress(time));
    return index === 0 ? gains.outgoing : gains.incoming;
  }
  function publicPlan() {
    if (!timelinePlan) return null;
    const { start, end, ...data } = timelinePlan;
    return { ...data, startTime: anchor + start, endTime: anchor + end, delay: Math.max(0, anchor + start - clock()) };
  }
  function snapshotData() {
    const time = position(), now = clock();
    return {
      state, contextTime: now, contextState: context.state || 'running', position: time, duration,
      masterGain: volume, plan: publicPlan(), crossfadeProgress: progress(time), pitchPreserved: false,
      decks: tracks.map((track, index) => {
        const entry = entries.find(item => item.index === index);
        const started = !!entry && time >= entry.start;
        const ended = !!entry && time >= entry.end - EPSILON;
        const running = state === 'playing' && (!context.state || context.state === 'running') && now >= anchor + time - EPSILON && started && !ended;
        const sourcePosition = entry ? clamp(entry.offset + Math.max(0, Math.min(time, entry.end) - entry.start) * entry.rate, 0, track.buffer.duration) : 0;
        const level = entry && started && !ended ? envelope(index, time) : 0;
        return { id: track.id, title: track.title, position: sourcePosition, rate: entry?.rate || 1, gain: running ? level : 0, envelopeGain: level, started, ended, playing: running, fx: { ...effects[index] } };
      }),
    };
  }
  function changed() { notify(onState, snapshotData()); }
  function releaseGraph(graph) {
    if (graph.source) {
      graph.source.onended = null;
      try { graph.source.stop(clock()); } catch { /* Already ended or failed before start. */ }
    }
    for (const node of graph.nodes) { try { node.disconnect(); } catch {} }
  }
  function releaseGraphs() {
    generation++;
    graphs.forEach(releaseGraph);
    graphs = [];
  }
  function pump() {
    if (state !== 'playing' || !entries.length) return;
    const time = position(), token = generation;
    if (timelinePlan && !advanced && time >= timelinePlan.end - EPSILON) {
      advanced = true;
      notify(onAdvance, { from: { id: tracks[0].id, title: tracks[0].title }, to: { id: tracks[1].id, title: tracks[1].title }, contextTime: clock() });
      if (generation !== token || state !== 'playing') return;
    }
    if (!finished && time >= duration - EPSILON) {
      finished = true; cursor = duration; state = 'ended'; releaseGraphs();
      changed(); notify(onFinished, snapshotData());
    }
  }
  function snapshot() { pump(); return snapshotData(); }
  function validTrack(track, index) {
    const buffer = track?.buffer;
    if (!buffer || !Number.isFinite(buffer.duration) || buffer.duration <= 0 || !Number.isFinite(buffer.sampleRate) || buffer.sampleRate <= 0 || typeof buffer.getChannelData !== 'function') {
      throw new TypeError('Each track needs a decoded AudioBuffer.');
    }
    return { id: String(track.id ?? `track-${index + 1}`), title: String(track.title ?? `Track ${index + 1}`), buffer, analysis: { ...track.analysis, duration: buffer.duration } };
  }
  function setTracks(value) {
    alive();
    if (!Array.isArray(value) || value.length > 2) throw new RangeError('Load at most two decoded tracks.');
    const accepted = value.map(validTrack);
    releaseGraphs(); tracks = accepted; entries = []; timelinePlan = null;
    cursor = 0; duration = 0; anchor = clock(); advanced = false; finished = false; state = 'idle';
    changed(); return snapshotData();
  }
  function makePlan(offset, fadeDuration, beatmatch) {
    const first = tracks[0], base = clock() + ahead;
    const current = { ...first.analysis, duration: first.buffer.duration };
    const remaining = first.buffer.duration - offset;
    entries = [{ index: 0, offset, rate: 1, start: 0, end: remaining }];
    timelinePlan = null;
    if (tracks[1]) {
      const next = { ...tracks[1].analysis, duration: tracks[1].buffer.duration };
      const planned = planMix({ current: beatmatch ? current : { ...current, confidence: 0 }, next, currentPosition: offset, now: base, fadeDuration });
      const start = planned.startTime - base, end = planned.endTime - base;
      timelinePlan = { ...planned, start, end };
      delete timelinePlan.startTime; delete timelinePlan.endTime;
      entries[0].end = Math.min(remaining, end);
      entries.push({ index: 1, offset: planned.offset, rate: planned.rate, start, end: start + (tracks[1].buffer.duration - planned.offset) / planned.rate });
    }
    duration = Math.max(...entries.map(entry => entry.end));
  }
  function param(nodeParam, value, time, smooth = false) {
    if (!smooth) { nodeParam.setValueAtTime(value, time); return; }
    nodeParam.cancelScheduledValues(time);
    nodeParam.setValueAtTime(nodeParam.value, time);
    nodeParam.linearRampToValueAtTime(value, time + .02);
  }
  function applyFx(graph, smooth = false) {
    const fx = effects[graph.index], now = clock();
    const dry = 1 / (1 + fx.echo / (1 - fx.echoFeedback));
    param(graph.filter.frequency, fx.filterHz, now, smooth);
    param(graph.delay.delayTime, fx.echoDelay, now, smooth);
    param(graph.feedback.gain, fx.echoFeedback, now, smooth);
    param(graph.dry.gain, dry, now, smooth);
    param(graph.wet.gain, fx.echo * dry, now, smooth);
  }
  function scheduleEnvelope(graph, entry, startAt, elapsed) {
    const localStart = Math.max(elapsed, entry.start);
    graph.gain.gain.value = envelope(entry.index, localStart);
    if (!timelinePlan || timelinePlan.fadeDuration <= 0 || timelinePlan.end <= localStart) {
      graph.gain.gain.setValueAtTime(envelope(entry.index, localStart), startAt); return;
    }
    const fadeStart = Math.max(localStart, timelinePlan.start), fadeEnd = timelinePlan.end;
    const curveStart = anchor + fadeStart;
    if (curveStart > startAt + EPSILON) graph.gain.gain.setValueAtTime(envelope(entry.index, localStart), startAt);
    const samples = new Float32Array(129);
    for (let index = 0; index < samples.length; index++) samples[index] = envelope(entry.index, fadeStart + (fadeEnd - fadeStart) * index / (samples.length - 1));
    graph.gain.gain.setValueCurveAtTime(samples, curveStart, fadeEnd - fadeStart);
  }
  function createGraph(entry, elapsed, token = generation) {
        const startAt = anchor + Math.max(entry.start, elapsed);
        const offset = entry.offset + Math.max(0, elapsed - entry.start) * entry.rate;
        const graph = { index: entry.index, source: null, nodes: [] };
        graphs.push(graph);
        const own = node => { graph.nodes.push(node); return node; };
        graph.source = own(context.createBufferSource()); graph.source.buffer = tracks[entry.index].buffer;
        graph.gain = own(context.createGain());
        graph.filter = own(context.createBiquadFilter()); graph.filter.type = 'lowpass'; graph.filter.Q.value = Math.SQRT1_2;
        graph.delay = own(context.createDelay(2)); graph.feedback = own(context.createGain());
        graph.dry = own(context.createGain()); graph.wet = own(context.createGain());
        graph.source.connect(graph.filter);
        graph.filter.connect(graph.dry); graph.dry.connect(graph.gain);
        graph.filter.connect(graph.delay); graph.delay.connect(graph.wet); graph.wet.connect(graph.gain);
        graph.delay.connect(graph.feedback); graph.feedback.connect(graph.delay);
        graph.gain.connect(master);
        applyFx(graph); scheduleEnvelope(graph, entry, startAt, elapsed);
        graph.source.playbackRate.setValueAtTime(entry.rate, startAt);
        graph.source.onended = () => { if (generation === token) pump(); };
        graph.source.start(startAt, offset);
        graph.source.stop(anchor + entry.end);
        return graph;
  }
  function schedule(elapsed) {
    if (context.state === 'closed') throw new Error('AudioContext is closed.');
    releaseGraphs();
    cursor = elapsed; anchor = clock() + ahead - elapsed;
    const token = generation;
    try {
      for (const entry of entries) if (entry.end > elapsed + EPSILON) createGraph(entry, elapsed, token);
      state = 'playing'; changed(); pump(); return snapshotData();
    } catch (error) {
      releaseGraphs(); state = 'paused'; changed(); throw error;
    }
  }
  function play({ offset = 0, fadeDuration = 8, beatmatch = true } = {}) {
    alive();
    if (!tracks.length) throw new Error('Load an audio track before playing.');
    offset = clamp(finite(offset, 'File offset'), 0, tracks[0].buffer.duration);
    finite(fadeDuration, 'Fade duration');
    if (fadeDuration < 0) throw new RangeError('Fade duration must not be negative.');
    releaseGraphs(); makePlan(offset, fadeDuration, beatmatch);
    advanced = false; finished = false; cursor = 0;
    return schedule(0);
  }
  function pause() {
    alive(); pump();
    if (state !== 'playing') return snapshotData();
    cursor = position(); releaseGraphs(); state = 'paused'; changed(); return snapshotData();
  }
  function resume() {
    alive();
    if (state !== 'paused') return snapshot();
    return schedule(cursor);
  }
  function seek(seconds) {
    alive();
    if (!entries.length) throw new Error('Start a pair before seeking its timeline.');
    const target = clamp(finite(seconds, 'Transport position'), 0, duration), wasPlaying = state === 'playing';
    releaseGraphs(); cursor = target;
    advanced = !!timelinePlan && target >= timelinePlan.end; finished = false;
    if (target >= duration) { state = 'ended'; finished = true; changed(); return snapshotData(); }
    if (wasPlaying) return schedule(target);
    state = 'paused'; changed(); return snapshotData();
  }
  function stop() {
    alive(); releaseGraphs(); state = 'stopped'; entries = []; timelinePlan = null;
    cursor = 0; duration = 0; advanced = false; finished = false; changed(); return snapshotData();
  }
  /**
   * After a completed overlap, null promotes the incoming track without touching
   * its running source. A later track attaches the next source to that same clock.
   * This permits releasing A before decoding C, retaining only B and C in memory.
   */
  function queueNext(track, { fadeDuration = 8, beatmatch = true } = {}) {
    alive();
    finite(fadeDuration, 'Fade duration');
    if (fadeDuration < 0) throw new RangeError('Fade duration must not be negative.');
    const accepted = track == null ? null : validTrack(track, 1);
    if (tracks.length === 2) {
      const time = position();
      if (!timelinePlan || time < timelinePlan.end - EPSILON) throw new Error('Finish the current overlap before queuing another track.');
      const incoming = entries.find(entry => entry.index === 1);
      const offset = clamp(incoming.offset + Math.max(0, Math.min(time, incoming.end) - incoming.start) * incoming.rate, 0, tracks[1].buffer.duration);
      const remaining = Math.max(0, (tracks[1].buffer.duration - offset) / incoming.rate);
      const retained = graphs.find(graph => graph.index === 1);
      graphs.filter(graph => graph !== retained).forEach(releaseGraph);
      graphs = retained ? [retained] : [];
      // Invalidate queued callbacks from A and rebind B without stop()/start().
      generation++;
      tracks = [tracks[1]]; effects[0] = { ...effects[1] };
      effects[1] = { filterHz: maxFilter, echo: 0, echoDelay: .25, echoFeedback: .3 };
      entries = [{ index: 0, offset, rate: incoming.rate, start: 0, end: remaining }];
      timelinePlan = null; cursor = 0; duration = remaining; anchor = clock(); advanced = false;
      if (retained) {
        retained.index = 0;
        const token = generation;
        retained.source.onended = () => { if (generation === token) pump(); };
        retained.gain.gain.cancelScheduledValues(clock());
        retained.gain.gain.setValueAtTime(1, clock());
      }
      if (remaining <= EPSILON) {
        graphs.forEach(releaseGraph); graphs = []; state = 'ended'; finished = true;
      } else finished = false;
    }
    if (!accepted) { changed(); return snapshotData(); }
    if (tracks.length !== 1 || !entries.length || !['playing', 'paused'].includes(state)) {
      throw new Error('A live or paused current track is required; start the next track explicitly after it ends.');
    }
    const time = position(), currentEntry = entries[0], current = tracks[0];
    const sourcePosition = clamp(currentEntry.offset + time * currentEntry.rate, 0, current.buffer.duration);
    const remaining = (current.buffer.duration - sourcePosition) / currentEntry.rate;
    if (remaining <= EPSILON) throw new Error('The current track has ended.');
    const lead = state === 'playing' ? Math.min(ahead, remaining / 4) : 0;
    const now = clock();
    const planned = planMix({ current: beatmatch ? current.analysis : { ...current.analysis, confidence: 0 }, next: accepted.analysis,
      currentPosition: sourcePosition + lead * currentEntry.rate, currentRate: currentEntry.rate, now: now + lead, fadeDuration });
    const start = time + lead + planned.delay, end = start + planned.fadeDuration;
    const original = { entries, duration, timelinePlan, advanced, finished };
    const retained = graphs.find(graph => graph.index === 0);
    tracks = [current, accepted];
    entries = [{ ...currentEntry, end }, { index: 1, offset: planned.offset, rate: planned.rate, start,
      end: start + (accepted.buffer.duration - planned.offset) / planned.rate }];
    timelinePlan = { ...planned, start, end }; delete timelinePlan.startTime; delete timelinePlan.endTime;
    duration = Math.max(...entries.map(entry => entry.end)); advanced = false; finished = false;
    try {
      if (state === 'playing') {
        createGraph(entries[1], time);
        if (!retained) throw new Error('The current audio source is unavailable.');
        retained.gain.gain.cancelScheduledValues(now);
        scheduleEnvelope(retained, entries[0], now, time);
        // Adjust only the future stop at the new fade end. B is never restarted.
        retained.source.stop(anchor + end);
      }
    } catch (error) {
      graphs.filter(graph => graph.index === 1).forEach(releaseGraph);
      graphs = graphs.filter(graph => graph.index !== 1); tracks = [current];
      entries = original.entries; duration = original.duration; timelinePlan = original.timelinePlan;
      advanced = original.advanced; finished = original.finished;
      if (retained) { retained.gain.gain.cancelScheduledValues(clock()); retained.gain.gain.setValueAtTime(1, clock()); retained.source.stop(anchor + entries[0].end); }
      throw error;
    }
    changed(); return snapshotData();
  }
  function setFx(index, changes = {}) {
    alive();
    if (![0, 1].includes(index)) throw new RangeError('Deck index must be 0 or 1.');
    const next = { ...effects[index] };
    for (const [name, min, max] of [['filterHz', 20, maxFilter], ['echo', 0, 1], ['echoDelay', .01, 1.5], ['echoFeedback', 0, .75]]) {
      if (changes[name] !== undefined) next[name] = clamp(finite(Number(changes[name]), name), min, max);
    }
    effects[index] = next;
    for (const graph of graphs.filter(item => item.index === index)) applyFx(graph, true);
    return { ...next };
  }
  function setVolume(value) {
    alive(); volume = clamp(finite(value, 'Master gain'), 0, 1); param(master.gain, volume, clock(), state === 'playing'); return volume;
  }
  function dispose() {
    if (state === 'disposed') return;
    releaseGraphs(); master.disconnect(); tracks = []; entries = []; timelinePlan = null;
    cursor = 0; duration = 0; state = 'disposed'; changed();
  }
  return { setTracks, play, pause, resume, seek, stop, queueNext, setFx, setVolume, snapshot, dispose };
}
