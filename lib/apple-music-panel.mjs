import { parseAppleMusicLink } from './apple-music-links.mjs';

/** Official Apple embed only. Does not expose audio buffers or promise DJ mixing. */
export function mountAppleMusicPanel({ root, canUse = () => false, onActivate = () => {} }) {
  if (!root) throw new Error('Apple Music 화면을 찾지 못했습니다.');
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  let tracks = [], selectedKey = null, frame = null, timer = null, generation = 0, active = false;
  root.classList.add('apple-music-panel');
  root.innerHTML = `
    <header class="apple-music-heading"><span>APPLE MUSIC</span><h1>좋아하는 음악을 담아요.</h1></header>
    <form class="apple-music-form">
      <label for="apple-music-url">Apple Music 공유 링크</label>
      <input id="apple-music-url" name="apple-music-url" type="url" inputmode="url" autocomplete="off" placeholder="https://music.apple.com/…" required aria-describedby="apple-music-help apple-music-status">
      <p id="apple-music-help">곡·앨범·플레이리스트 링크를 붙여넣으세요. 가져오기를 누르면 Apple의 공식 플레이어에 연결합니다.</p>
      <button class="primary apple-music-import" type="submit">링크 가져오기</button>
    </form>
    <p class="apple-music-status" id="apple-music-status" role="status" aria-live="polite">Apple Music에서 공유한 링크를 기다리고 있어요.</p>
    <section class="apple-music-current" aria-label="선택한 Apple Music 항목" hidden>
      <div class="apple-music-current-heading"><h2></h2><button class="apple-music-stop" type="button">재생 닫기</button></div>
      <div class="apple-music-player"></div>
      <button class="apple-music-reopen" type="button" hidden>플레이어 다시 열기</button>
      <a class="apple-music-original" target="_blank" rel="noopener noreferrer">Apple Music에서 열기</a>
    </section>
    <section class="apple-music-collection" aria-label="가져온 Apple Music 링크" hidden><h2>가져온 링크</h2><ol></ol></section>
    <p class="apple-music-note">전체 곡 재생은 Apple Music 로그인·구독과 제공 지역에 따라 달라집니다. 로그인하지 않으면 미리듣기로 표시될 수 있어요.</p>
    <p class="apple-music-note">이 연결은 공식 플레이어 재생을 지원하며, 비트매칭은 제공하지 않습니다. 가져온 링크는 이 화면을 새로고침하면 지워집니다.</p>
  `;
  const find = selector => root.querySelector(selector);
  const form = find('form'), input = find('input'), status = find('.apple-music-status');
  const current = find('.apple-music-current'), currentTitle = current.querySelector('h2');
  const player = find('.apple-music-player'), stop = find('.apple-music-stop'), reopen = find('.apple-music-reopen');
  const original = find('.apple-music-original'), collection = find('.apple-music-collection'), list = collection.querySelector('ol');
  const selected = () => tracks.find(track => track.key === selectedKey);
  function message(text, error = false) { status.textContent = text; status.classList.toggle('error', error); }
  function removeFrame() {
    generation++;
    win.clearTimeout(timer); timer = null;
    if (frame) { frame.onload = null; frame.onerror = null; frame.remove(); frame = null; }
    stop.hidden = true;
  }
  function render() {
    list.replaceChildren(); collection.hidden = !tracks.length;
    for (const track of tracks) {
      const item = doc.createElement('li');
      const choose = doc.createElement('button');
      choose.type = 'button'; choose.className = 'apple-music-item';
      choose.setAttribute('aria-pressed', String(track.key === selectedKey));
      const kind = doc.createElement('span'); kind.className = 'apple-music-kind'; kind.textContent = track.kindLabel;
      const title = doc.createElement('span'); title.textContent = track.title;
      choose.append(kind, title); choose.addEventListener('click', () => open(track));
      const remove = doc.createElement('button'); remove.type = 'button'; remove.className = 'apple-music-remove'; remove.textContent = '삭제';
      remove.setAttribute('aria-label', `${track.title} 링크 삭제`);
      remove.addEventListener('click', () => {
        if (selectedKey === track.key) { removeFrame(); selectedKey = null; current.hidden = true; }
        tracks = tracks.filter(entry => entry.key !== track.key); render();
        message('링크를 삭제했습니다.');
      });
      item.append(choose, remove); list.append(item);
    }
  }
  function open(track) {
    if (!canUse()) { message('계정 로그인 후 음악을 가져올 수 있습니다.', true); return; }
    onActivate(); active = true; removeFrame(); selectedKey = track.key;
    current.hidden = false; reopen.hidden = true; stop.hidden = false;
    currentTitle.textContent = `${track.kindLabel} · ${track.title}`;
    original.href = track.url;
    message('Apple Music 플레이어를 여는 중입니다.');
    const request = generation;
    frame = doc.createElement('iframe');
    frame.title = `Apple Music ${track.kindLabel} 플레이어`;
    frame.height = String(track.embedHeight); frame.width = '100%';
    frame.allow = 'autoplay *; encrypted-media *; fullscreen *;';
    frame.setAttribute('sandbox', 'allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation');
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.onload = () => {
      if (request !== generation || !active) return;
      win.clearTimeout(timer);
      message('재생하려면 아래 Apple Music 플레이어의 재생 버튼을 눌러 주세요.');
    };
    frame.onerror = () => {
      if (request !== generation || !active) return;
      win.clearTimeout(timer);
      message('플레이어를 불러오지 못했습니다. Apple Music에서 열기로 계속할 수 있어요.', true);
    };
    frame.src = track.embedUrl; player.replaceChildren(frame);
    timer = win.setTimeout(() => {
      if (request === generation && active) message('화면이 보이지 않으면 Apple Music에서 열기를 눌러 주세요. 연결 상태나 제공 지역을 확인해 주세요.');
    }, 15000);
    render();
  }
  function submit(event) {
    event.preventDefault();
    if (!canUse()) { message('계정 로그인 후 음악을 가져올 수 있습니다.', true); return; }
    let track;
    try { track = parseAppleMusicLink(input.value); } catch (error) { message(error.message, true); return; }
    const existing = tracks.find(entry => entry.key === track.key);
    if (!existing && tracks.length >= 50) { message('한 화면에는 링크를 50개까지 담을 수 있습니다. 사용하지 않는 링크를 지워 주세요.', true); return; }
    if (!existing) tracks.push(track);
    input.value = '';
    open(existing || track);
  }
  function suspend() {
    active = false; removeFrame();
    reopen.hidden = !selected();
    if (selected()) message('재생을 닫았습니다. 다시 들으려면 플레이어 다시 열기를 눌러 주세요.');
  }
  function activate() {
    active = true;
    // Switching tabs never starts audio or reloads an external player implicitly.
    reopen.hidden = !selected() || Boolean(frame);
  }
  function clear() {
    suspend(); tracks = []; selectedKey = null; input.value = ''; current.hidden = true;
    original.removeAttribute('href'); currentTitle.textContent = ''; render();
    message('Apple Music에서 공유한 링크를 기다리고 있어요.');
  }
  function resume() { const track = selected(); if (track) open(track); }
  function onVisibility() { if (doc.hidden) suspend(); }
  form.addEventListener('submit', submit); stop.addEventListener('click', suspend); reopen.addEventListener('click', resume);
  doc.addEventListener('visibilitychange', onVisibility); win.addEventListener('pagehide', suspend);
  return {
    activate, suspend, clear,
    destroy() {
      clear(); form.removeEventListener('submit', submit); stop.removeEventListener('click', suspend); reopen.removeEventListener('click', resume);
      doc.removeEventListener('visibilitychange', onVisibility); win.removeEventListener('pagehide', suspend); root.replaceChildren();
    },
  };
}
