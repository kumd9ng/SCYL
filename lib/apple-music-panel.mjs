import { searchAppleMusic } from './apple-music-search.mjs';
import { createAppleMusicAccount } from './apple-music-account.mjs';
import { getRelatedAppleMusicTracks } from './apple-music-suggestions.mjs';

/** Search and select music here; Apple remains responsible for subscriber playback. */
export function mountAppleMusicPanel({ root, canUse = () => false, onActivate = () => {} }) {
  if (!root) throw new Error('Apple Music 화면을 찾지 못했습니다.');
  const doc = root.ownerDocument, win = doc.defaultView;
  let tracks = [], results = [], selectedKey = null, frame = null, timer = null;
  let playbackGeneration = 0, searchGeneration = 0, queryController = null, active = false, disposed = false;
  let suggestions = [], suggestionGeneration = 0, suggestionController = null;
  let account;
  root.classList.add('apple-music-panel');
  root.innerHTML = `
    <header class="apple-music-heading"><span>APPLE MUSIC</span><h2>검색해서 음악을 담아요.</h2></header>
    <div class="apple-music-account"><button class="apple-music-login" type="button">Apple Music 로그인</button><button class="apple-music-logout" type="button" hidden>연결 해제</button><p class="apple-music-account-status" role="status"></p></div>
    <form class="apple-music-form" role="search">
      <label for="apple-music-query">곡명 또는 가수 이름</label>
      <div class="apple-music-search-field"><input id="apple-music-query" name="query" type="search" inputmode="search" autocomplete="off" maxlength="200" placeholder="곡명 또는 가수 이름" required aria-describedby="apple-music-scope"><button class="apple-music-search-button" type="submit">검색</button></div>
      <p id="apple-music-scope" class="apple-music-scope"></p>
    </form>
    <p class="apple-music-status" id="apple-music-status" role="status" aria-live="polite">곡명이나 가수 이름으로 찾아보세요.</p>
    <section class="apple-music-current" aria-label="선택한 Apple Music 곡" hidden>
      <div class="apple-music-current-heading"><div><h3></h3><p class="apple-music-current-artist"></p></div><button class="apple-music-stop" type="button">재생 멈추기</button></div>
      <div class="apple-music-player"></div>
      <button class="apple-music-reopen" type="button" hidden>재생</button>
      <a class="apple-music-original" target="_blank" rel="noopener noreferrer">Apple Music에서 열기</a>
    </section>
    <section class="apple-music-suggestions" aria-label="이어 담을 곡 제안" hidden>
      <h3>같은 아티스트의 다른 곡</h3>
      <p class="apple-music-suggestion-status" role="status"></p>
      <ul class="apple-music-lps"></ul>
      <button class="apple-music-suggestion-retry" type="button" hidden>다시 불러오기</button>
    </section>
    <section class="apple-music-collection" aria-label="담은 Apple Music 곡" hidden><h3>담은 곡</h3><ol></ol></section>
    <section class="apple-music-results" aria-label="음악 검색 결과" hidden><h3>검색 결과</h3><ol></ol></section>
    <p class="apple-music-note">전체 곡 재생에는 Apple Music 로그인과 구독이 필요합니다. 곡 제공 여부는 계정 지역에 따라 달라질 수 있어요.</p>
    <p class="apple-music-note">Apple Music 비트매칭은 아직 지원하지 않습니다. 담은 곡은 이 화면을 새로고침하면 지워집니다.</p>
  `;
  const find = selector => root.querySelector(selector);
  const form = find('form'), input = find('input'), searchButton = find('.apple-music-search-button'), status = find('.apple-music-status');
  const login = find('.apple-music-login'), logout = find('.apple-music-logout'), accountStatus = find('.apple-music-account-status'), scope = find('.apple-music-scope');
  const resultSection = find('.apple-music-results'), resultList = resultSection.querySelector('ol');
  const current = find('.apple-music-current'), currentTitle = current.querySelector('h3'), currentArtist = find('.apple-music-current-artist');
  const player = find('.apple-music-player'), stop = find('.apple-music-stop'), reopen = find('.apple-music-reopen');
  const original = find('.apple-music-original'), collection = find('.apple-music-collection'), list = collection.querySelector('ol');
  const suggestionSection = find('.apple-music-suggestions'), suggestionList = find('.apple-music-lps');
  const suggestionStatus = find('.apple-music-suggestion-status'), suggestionRetry = find('.apple-music-suggestion-retry');
  const selected = () => tracks.find(track => track.key === selectedKey);
  function message(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
  function stateOfAccount() { return account?.state?.() || { configured: false, ready: false, authorized: false, busy: false }; }
  function renderAccount(state = stateOfAccount()) {
    if (disposed) return;
    login.disabled = !state.configured || state.busy || state.authorized || !state.ready;
    login.textContent = state.authorized ? 'Apple Music 연결됨' : state.busy ? 'Apple Music 연결 중…' : !state.ready && state.configured ? 'Apple Music 연결' : 'Apple Music 로그인';
    logout.hidden = !state.authorized;
    accountStatus.textContent = !state.configured ? 'Apple Music 계정 연결 준비 중입니다. 아래에서 음악을 검색할 수 있어요.'
      : state.authorized ? 'Apple Music 계정으로 음악을 재생할 수 있어요.'
      : state.ready ? '로그인을 누르면 Apple 계정 인증 화면이 열립니다.' : '계정을 연결하고 Apple Music에서 음악을 가져오세요.';
    scope.textContent = state.configured ? 'Apple Music 곡 검색' : '미국 공개 음악 목록 · 한국 계정의 제공 곡과 다를 수 있습니다.';
  }
  account = createAppleMusicAccount({ onState: renderAccount });
  renderAccount();
  function removeFrame() {
    playbackGeneration++;
    win.clearTimeout(timer); timer = null;
    if (frame) { frame.onload = null; frame.onerror = null; frame.remove(); frame = null; }
    stop.hidden = true;
  }
  function cancelSearch() {
    searchGeneration++;
    queryController?.abort(); queryController = null;
    searchButton.disabled = false; searchButton.textContent = '검색'; form.removeAttribute('aria-busy');
  }
  function cancelSuggestions() {
    suggestionGeneration++; suggestionController?.abort(); suggestionController = null;
  }
  function renderSuggestions() {
    suggestionList.replaceChildren();
    for (const track of suggestions) {
      const row = doc.createElement('li'), choose = doc.createElement('button');
      choose.type = 'button'; choose.className = 'apple-music-lp-card';
      const included = tracks.some(saved => saved.key === track.key);
      choose.disabled = included;
      choose.setAttribute('aria-label', `${track.title} · ${track.artist} ${included ? '담음' : '담기'}`);
      const disc = doc.createElement('span'); disc.className = 'apple-music-lp'; disc.setAttribute('aria-hidden', 'true');
      if (track.source === 'musickit' && track.artworkUrl) {
        const cover = doc.createElement('img'); cover.src = track.artworkUrl; cover.alt = ''; cover.loading = 'lazy';
        cover.addEventListener('error', () => cover.remove(), { once: true }); disc.append(cover);
      }
      choose.append(disc, trackDetails(track));
      const action = doc.createElement('span'); action.className = 'apple-music-lp-action'; action.textContent = included ? '담음' : '+ 담기';
      choose.append(action); choose.addEventListener('click', () => addTrack(track, { play: false }));
      row.append(choose); suggestionList.append(row);
    }
  }
  async function loadSuggestions(track) {
    cancelSuggestions(); suggestions = []; renderSuggestions();
    suggestionSection.hidden = false; suggestionRetry.hidden = true;
    suggestionStatus.textContent = `${track.artist}의 다른 곡을 찾고 있어요.`;
    const request = suggestionGeneration, controller = suggestionController = new AbortController();
    try {
      const found = await getRelatedAppleMusicTracks(track, {
        collected: tracks, signal: controller.signal,
        ...(account.configured ? { search: (artist, options) => account.search(artist, options) } : {}),
      });
      if (request !== suggestionGeneration || controller.signal.aborted || !active || !canUse() || selectedKey !== track.key) return;
      suggestions = found; renderSuggestions();
      suggestionStatus.textContent = found.length ? 'LP판을 누르면 담은 곡에 추가됩니다.' : '아직 담지 않은 다른 곡을 찾지 못했어요.';
    } catch {
      if (request !== suggestionGeneration || controller.signal.aborted) return;
      suggestionStatus.textContent = '다른 곡을 불러오지 못했습니다. 다시 시도해 주세요.'; suggestionRetry.hidden = false;
    } finally { if (request === suggestionGeneration) suggestionController = null; }
  }
  function trackDetails(track) {
    const details = doc.createElement('span'); details.className = 'apple-music-track-details';
    const title = doc.createElement('span'); title.className = 'apple-music-track-title'; title.textContent = track.title;
    const artist = doc.createElement('span'); artist.className = 'apple-music-track-artist'; artist.textContent = track.artist || '';
    const album = doc.createElement('span'); album.className = 'apple-music-track-album'; album.textContent = track.album || '';
    details.append(title, artist, album); return details;
  }
  function appendArtwork(row, track) {
    // Public iTunes promotional artwork requires a nearby store badge. The
    // public-search fallback uses metadata only; MusicKit supplies licensed art.
    if (track.source !== 'musickit' || !track.artworkUrl) return;
    const image = doc.createElement('img'); image.src = track.artworkUrl; image.alt = ''; image.width = 48; image.height = 48;
    image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.addEventListener('error', () => image.remove(), { once: true });
    row.append(image);
  }
  function renderResults() {
    resultList.replaceChildren(); resultSection.hidden = !results.length;
    for (const track of results) {
      const row = doc.createElement('li'); appendArtwork(row, track); row.append(trackDetails(track));
      const add = doc.createElement('button'); add.type = 'button'; add.className = 'apple-music-add';
      const included = tracks.some(saved => saved.key === track.key);
      add.textContent = included ? '담음' : '담기'; add.disabled = included;
      add.setAttribute('aria-label', `${track.title} · ${track.artist || ''} ${included ? '담음' : '담기'}`);
      add.addEventListener('click', () => addTrack(track)); row.append(add); resultList.append(row);
    }
  }
  function renderCollection() {
    list.replaceChildren(); collection.hidden = !tracks.length;
    collection.querySelector('h3').textContent = `담은 곡 · ${tracks.length}`;
    for (const track of tracks) {
      const item = doc.createElement('li');
      const choose = doc.createElement('button'); choose.type = 'button'; choose.className = 'apple-music-item';
      choose.setAttribute('aria-pressed', String(track.key === selectedKey));
      choose.append(trackDetails(track)); choose.addEventListener('click', () => void open(track));
      const remove = doc.createElement('button'); remove.type = 'button'; remove.className = 'apple-music-remove'; remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${track.title} 담은 곡에서 삭제`);
      remove.addEventListener('click', () => {
        if (selectedKey === track.key) { removeFrame(); account.pause(); selectedKey = null; current.hidden = true; }
        tracks = tracks.filter(entry => entry.key !== track.key); renderCollection(); renderResults(); renderSuggestions();
        if (!selectedKey) { cancelSuggestions(); suggestions = []; suggestionSection.hidden = true; }
        message('담은 곡에서 삭제했습니다.');
      });
      item.append(choose, remove); list.append(item);
    }
  }
  function addTrack(track, { play = true } = {}) {
    if (!canUse()) { message('계정 로그인 후 음악을 담을 수 있습니다.', true); return; }
    if (tracks.length >= 50) { message('한 번에 50곡까지 담을 수 있습니다. 사용하지 않는 곡을 지워 주세요.', true); return; }
    if (!tracks.some(entry => entry.key === track.key)) tracks.push(track);
    renderCollection(); renderResults(); renderSuggestions();
    if (play) void open(track);
    else message(`${track.title} · 담은 곡에 추가했습니다.`);
  }
  async function open(track) {
    if (!canUse()) { message('계정 로그인 후 음악을 재생할 수 있습니다.', true); return; }
    onActivate(); active = true; removeFrame(); account.pause(); selectedKey = track.key;
    current.hidden = false; reopen.hidden = true; stop.hidden = false;
    currentTitle.textContent = track.title; currentArtist.textContent = track.artist || '';
    original.href = track.url; renderCollection();
    void loadSuggestions(track);
    const request = playbackGeneration;
    if (track.source === 'musickit') {
      if (!stateOfAccount().authorized) {
        stop.hidden = true; reopen.hidden = false;
        message('곡을 담았습니다. 위의 Apple Music 로그인으로 계정을 연결한 뒤 재생해 주세요.');
        return;
      }
      message('Apple Music에서 재생을 시작합니다.');
      try {
        await account.play(track);
        if (request !== playbackGeneration || !active || !canUse()) { account.pause(); return; }
        message(`${track.title} · 재생 중`);
      } catch {
        if (request !== playbackGeneration || !active) return;
        stop.hidden = true; reopen.hidden = false;
        message('재생하지 못했습니다. Apple Music 구독과 연결 상태를 확인한 뒤 다시 재생해 주세요.', true);
      }
      return;
    }
    message('곡을 담았습니다. 아래 Apple Music 플레이어에서 재생할 수 있어요.');
    frame = doc.createElement('iframe'); frame.title = `${track.title} · Apple Music 플레이어`;
    frame.height = String(track.embedHeight || 175); frame.width = '100%';
    frame.allow = 'autoplay *; encrypted-media *; fullscreen *;';
    frame.setAttribute('sandbox', 'allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation');
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.onload = () => {
      if (request !== playbackGeneration || !active) return;
      win.clearTimeout(timer); message('아래 Apple Music 플레이어의 재생 버튼을 눌러 주세요.');
    };
    frame.onerror = () => {
      if (request !== playbackGeneration || !active) return;
      win.clearTimeout(timer); message('플레이어를 불러오지 못했습니다. 다시 재생하거나 Apple Music에서 열어 주세요.', true);
    };
    frame.src = track.embedUrl; player.replaceChildren(frame);
    timer = win.setTimeout(() => {
      if (request === playbackGeneration && active) message('화면이 보이지 않으면 연결 상태나 해당 곡의 제공 지역을 확인해 주세요.');
    }, 15000);
  }
  async function submit(event) {
    event.preventDefault();
    if (!canUse()) { message('계정 로그인 후 음악을 검색할 수 있습니다.', true); return; }
    const query = input.value.trim();
    if (!query) { message('곡명이나 가수 이름을 입력해 주세요.', true); input.focus(); return; }
    cancelSearch(); active = true;
    const request = searchGeneration, controller = queryController = new AbortController();
    results = []; renderResults(); searchButton.disabled = true; searchButton.textContent = '검색 중…'; form.setAttribute('aria-busy', 'true');
    message('음악을 찾고 있어요.');
    try {
      const found = account.configured ? await account.search(query, { signal: controller.signal })
        : await searchAppleMusic(query, { country: 'us', signal: controller.signal });
      if (request !== searchGeneration || controller.signal.aborted || !active || !canUse()) return;
      results = found; renderResults();
      message(results.length ? `${results.length}곡을 찾았습니다. 원하는 곡의 담기를 눌러 주세요.` : '검색 결과가 없습니다. 다른 곡명이나 가수 이름으로 검색해 주세요.');
    } catch (error) {
      if (request !== searchGeneration || controller.signal.aborted || !active) return;
      message(error?.name === 'AbortError' ? '검색을 취소했습니다.' : '음악을 찾지 못했습니다. 연결 상태를 확인하고 다시 검색해 주세요.', true);
    } finally {
      if (request === searchGeneration) { queryController = null; searchButton.disabled = false; searchButton.textContent = '검색'; form.removeAttribute('aria-busy'); }
    }
  }
  async function connect() {
    if (!canUse()) { message('SCYL 계정 로그인 후 Apple Music을 연결할 수 있습니다.', true); return; }
    if (!account.configured) return;
    try {
      if (!stateOfAccount().ready) { await account.prepare(); renderAccount(); return; }
      // Keep authorize directly inside the click event, before any await, so
      // Apple can open its authentication window using this user gesture.
      const authorization = account.authorize(); await authorization;
      if (disposed || !canUse()) { account.pause(); return; }
      results = []; renderResults(); renderAccount(); message('Apple Music에 연결했습니다. 곡을 검색해서 담아 주세요.');
    } catch {
      if (!disposed) { renderAccount(); message('Apple Music에 연결하지 못했습니다. 로그인 화면을 다시 열어 주세요.', true); }
    }
  }
  async function disconnect() {
    suspend();
    try { await account.unauthorize(); } catch { message('연결 해제를 마치지 못했습니다. 다시 시도해 주세요.', true); }
    results = []; renderResults(); renderAccount();
  }
  function suspend() {
    active = false; cancelSearch();
    if (suggestionController) { cancelSuggestions(); suggestionStatus.textContent = '다른 곡 불러오기를 멈췄습니다.'; suggestionRetry.hidden = false; }
    removeFrame(); account?.pause();
    reopen.hidden = !selected();
    if (selected()) message('재생을 멈췄습니다. 다시 들으려면 재생을 눌러 주세요.');
  }
  function activate() {
    active = true; reopen.hidden = !selected() || Boolean(frame);
    if (account.configured && !stateOfAccount().ready) {
      void account.prepare().catch(() => {
        if (!disposed) { login.disabled = false; message('Apple Music 연결을 준비하지 못했습니다. 연결 버튼으로 다시 시도해 주세요.', true); }
      });
    }
  }
  function clear() {
    suspend(); account?.suspend(); tracks = []; results = []; suggestions = []; selectedKey = null; input.value = ''; current.hidden = true;
    cancelSuggestions(); renderSuggestions(); suggestionSection.hidden = true;
    original.removeAttribute('href'); currentTitle.textContent = ''; currentArtist.textContent = '';
    renderCollection(); renderResults(); message('곡명이나 가수 이름으로 찾아보세요.');
  }
  function resume() { const track = selected(); if (track) void open(track); }
  function retrySuggestions() { const track = selected(); if (track && canUse()) { active = true; void loadSuggestions(track); } }
  function onVisibility() { if (doc.hidden) suspend(); }
  function onPageHide() { suspend(); account.suspend(); }
  form.addEventListener('submit', submit); stop.addEventListener('click', suspend); reopen.addEventListener('click', resume);
  login.addEventListener('click', connect); logout.addEventListener('click', disconnect);
  suggestionRetry.addEventListener('click', retrySuggestions);
  doc.addEventListener('visibilitychange', onVisibility); win.addEventListener('pagehide', onPageHide);
  return {
    activate, suspend, clear,
    destroy() {
      clear(); disposed = true; account.destroy();
      form.removeEventListener('submit', submit); stop.removeEventListener('click', suspend); reopen.removeEventListener('click', resume);
      login.removeEventListener('click', connect); logout.removeEventListener('click', disconnect);
      suggestionRetry.removeEventListener('click', retrySuggestions);
      doc.removeEventListener('visibilitychange', onVisibility); win.removeEventListener('pagehide', onPageHide); root.replaceChildren();
    },
  };
}
