import { createClient } from '@supabase/supabase-js';
import { createSharedAccount, PASSWORD_MIN_LENGTH } from './shared-account.mjs';
import { ACCOUNT_CALLBACK, createAccountLinkInbox, readAccountCode } from './account-links.mjs';
import { COMPANIONS, COAT_LABELS, MBTI_TYPES, getCompanion, companionAvatarStyle, isCompanionProfile } from './companion-catalog.mjs';
import { rememberVerifiedEmail as persistVerifiedEmail, readRememberedEmail, beginPasswordSetup, readPasswordSetup, finishPasswordSetup } from './account-continuation.mjs';

const configured = typeof __SCYL_ACCOUNT_CONFIG__ !== 'undefined' ? __SCYL_ACCOUNT_CONFIG__ : null;

// Authentication is a shared identity; music and MEOW activity are not copied here.
export function mountAccount({ onLock = () => {}, onSignedIn = () => {}, completionCode = null, initialMessage = '', passwordSetup = false, expectedUserId = null, config = configured,
  createAccount = createSharedAccount, loadNativeApp = () => import('@capacitor/app').then(module => module.App) } = {}) {
  if (!config) return { configured: false, canUse: () => true, require: () => true, open() {} };
  const native = Boolean(window.Capacitor?.isNativePlatform?.());
  let account, state, lastUser = null, notifiedUser = null, inbox = null, disposed = false, logoutIntent = false;
  let unsubscribe = null, nativeHandle = null, retryTimer = null;
  let profileOwner = null, selectedCat = '', selectedMbti = '', selectedCoat = 'all', savingProfile = false, checkingProfile = false, profileError = '', saveEpoch = 0;
  let authMode = 'password', signingIn = false, loginError = '', loginEpoch = 0;
  let savingPassword = false, passwordMessage = '', passwordError = false, passwordEpoch = 0;
  let passwordStep = Boolean(passwordSetup || completionCode), setupOwner = expectedUserId, setupAttempt = null;
  let openedByLock = false;
  const main = document.querySelector('main');
  const entry = document.createElement('button');
  entry.type = 'button'; entry.className = 'scyl-account-entry'; entry.textContent = '계정';
  main.querySelector('header').append(entry);
  const panel = document.createElement('dialog'); panel.className = 'scyl-account';
  panel.setAttribute('aria-labelledby', 'account-heading');
  panel.innerHTML = `<header><img src="assets/scyl-mark.svg" width="36" height="36" alt=""><button type="button" data-close aria-label="계정 창 닫기" hidden>닫기</button></header>
    <h2 id="account-heading">하나의 계정으로.</h2><p data-account-intro>MEOW와 SCYL을 같은 이메일로 이용하세요.<br>기존 MEOW 회원은 다시 가입하지 않아도 됩니다.</p>
    <form><label>이메일<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label>
    <label data-password-field>비밀번호<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="account-primary" type="submit" data-request-submit>로그인</button>
    <details data-code-section hidden><summary>숫자 코드가 있는 메일인가요?</summary><label>인증 코드<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,8}" minlength="6" maxlength="8"></label><button class="account-primary" type="submit" data-code-submit>코드로 로그인</button></details>
    <button type="button" data-change hidden>이메일 변경 · 새 메일 받기</button>
    <button type="button" data-email-mode>처음 가입 · 비밀번호 찾기</button><button type="button" data-password-mode hidden>비밀번호로 로그인</button>
    <p class="account-note" data-auth-help>이 기기에서는 로그인을 유지합니다.</p></form>
    <p data-message role="status" aria-live="polite">계정을 확인하고 있습니다.</p><button type="button" data-retry-profile hidden>공통 프로필 다시 확인</button><button type="button" data-retry-logout hidden>로그아웃 다시 시도</button>
    <form data-profile-form hidden>
      <fieldset class="companion-fieldset"><legend>함께 들을 고양이</legend><div class="companion-filters" data-cat-filters role="group" aria-label="고양이 분류"></div><div class="companion-grid" data-cats></div></fieldset>
      <p class="companion-selection" data-cat-selected aria-live="polite">고양이를 골라 주세요.</p>
      <label class="companion-mbti">나의 MBTI<select name="mbti" required aria-label="나의 MBTI"><option value="">MBTI 선택</option></select></label>
      <button type="submit" class="account-primary" data-profile-save disabled>선택하고 음악 듣기</button>
      <p class="account-note">선택은 두 앱이 함께 쓰는 회원 정보 한곳에 저장됩니다. 확정한 고양이와 MBTI는 바꿀 수 없어요.</p>
    </form>
    <section data-signed hidden><p data-profile-label hidden></p><p data-email></p><button type="button" class="account-primary" data-continue>음악 듣기</button>
      <details class="account-password-settings" data-password-settings><summary>비밀번호 설정·변경</summary>
        <form data-password-form><label>새 비밀번호<input name="newPassword" type="password" autocomplete="new-password" minlength="${PASSWORD_MIN_LENGTH}" required></label>
        <label>새 비밀번호 확인<input name="confirmPassword" type="password" autocomplete="new-password" minlength="${PASSWORD_MIN_LENGTH}" required></label>
        <p class="account-note">${PASSWORD_MIN_LENGTH}자 이상으로 설정해 주세요. 두 앱에서 같은 계정의 비밀번호를 사용합니다.</p>
        <button type="submit" class="account-primary" data-password-save>비밀번호 저장</button><p data-password-message role="status" aria-live="polite"></p></form>
      </details>
      <button type="button" data-password-existing hidden>이미 비밀번호가 있어요</button>
      <button type="button" data-logout>이 기기의 SCYL 로그아웃</button><p class="account-note">MEOW 로그인과 계정은 유지됩니다.</p></section>
    <p class="account-note">처음 이용하는 이메일은 인증 후 공통 계정이 만들어집니다. 음악 파일은 업로드하지 않습니다.</p>
    <a href="privacy.html">개인정보 안내</a>`;
  document.body.append(panel);
  const find = selector => panel.querySelector(selector);
  const form = find('form'), email = form.elements.email, code = form.elements.code, password = form.elements.password;
  const codeSection = find('[data-code-section]');
  const passwordForm = find('[data-password-form]'), passwordSettings = find('[data-password-settings]');
  function clearPasswordInputs({ invalidate = false } = {}) {
    password.value = ''; passwordForm.elements.newPassword.value = ''; passwordForm.elements.confirmPassword.value = '';
    if (invalidate) {
      loginEpoch++; passwordEpoch++; signingIn = false; savingPassword = false; loginError = ''; passwordMessage = ''; passwordError = false;
      if (passwordSettings.open) passwordSettings.open = false;
    }
  }
  const profileForm = find('[data-profile-form]'), catGrid = find('[data-cats]'), mbti = profileForm.elements.mbti;
  const coatChoices = new Map();
  for (const [coat, name] of [['all', '전체'], ...Object.entries(COAT_LABELS)]) {
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = coat === 'hairless' ? '무모' : name;
    button.setAttribute('aria-label', name); button.title = name;
    button.setAttribute('aria-pressed', String(coat === selectedCoat));
    find('[data-cat-filters]').append(button); coatChoices.set(coat, button);
    button.addEventListener('click', () => {
      if (!authenticated() || passwordStep || setupAccountMismatch() || state.profileUnavailable || savingProfile || checkingProfile || savingPassword || selectedCoat === coat) return;
      selectedCoat = coat; catGrid.scrollTop = 0; renderProfile();
    });
  }
  const catChoices = new Map();
  function populateCats() {
    if (catChoices.size || disposed) return;
    const choices = document.createDocumentFragment();
    for (const companion of COMPANIONS) {
      const label = document.createElement('label'); label.className = 'companion-choice';
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'scyl-cat'; radio.value = companion.id;
      radio.setAttribute('aria-label', companion.name);
      const avatar = document.createElement('span'); avatar.className = 'companion-avatar'; avatar.setAttribute('aria-hidden', 'true');
      Object.assign(avatar.style, companionAvatarStyle(companion.id));
      const name = document.createElement('span'); name.className = 'companion-name'; name.textContent = companion.name;
      label.append(radio, avatar, name); choices.append(label); catChoices.set(companion.id, { label, radio, coats: companion.coats });
      radio.addEventListener('change', () => {
        if (disposed || passwordStep || setupAccountMismatch() || state?.busy || state?.profileUnavailable || savingProfile || checkingProfile || savingPassword || !radio.checked) return;
        selectedCat = companion.id; profileError = ''; render(state);
      });
    }
    catGrid.append(choices);
  }
  function releaseCats() {
    if (!catChoices.size) return;
    catGrid.replaceChildren(); catChoices.clear();
  }
  for (const type of MBTI_TYPES) {
    const option = document.createElement('option'); option.value = type; option.textContent = type; mbti.append(option);
  }
  let rememberedEmail = '', lastVerifiedEmail = '', lastAutofill = '', emailEdited = false;
  function fillRememberedEmail(value) {
    if (emailEdited || (email.value && email.value !== lastAutofill)) return;
    email.value = value; lastAutofill = value;
  }
  rememberedEmail = readRememberedEmail();
  if (!rememberedEmail && expectedUserId) {
    const pending = readPasswordSetup();
    if (pending?.userId === expectedUserId) rememberedEmail = pending.email;
  }
  if (rememberedEmail) fillRememberedEmail(rememberedEmail);
  email.addEventListener('input', () => { emailEdited = true; });
  function rememberVerifiedEmail(value) {
    if (value !== lastVerifiedEmail) {
      const address = persistVerifiedEmail(value);
      if (!address) return;
      rememberedEmail = address; lastVerifiedEmail = value;
    }
    fillRememberedEmail(rememberedEmail);
  }
  function finishPasswordStep(owner, attempt = setupAttempt) {
    if (attempt?.userId === owner) finishPasswordSetup(owner, attempt.id);
    passwordStep = false; setupAttempt = null;
  }
  function cancelPasswordAttempt() {
    if (setupAttempt) finishPasswordSetup(setupAttempt.userId, setupAttempt.id);
    setupAttempt = null;
    // A callback remains bound to its explicitly confirmed account. Only a
    // regular app login can start a new account's password flow here.
    if (!expectedUserId) { passwordStep = false; setupOwner = null; }
  }
  const authenticated = () => Boolean(!disposed && state?.ready && !state.busy && state.phase === 'signed-in' && state.user);
  const setupAccountMismatch = () => Boolean(setupOwner && state?.user && state.user.id !== setupOwner);
  const canUse = () => authenticated() && !passwordStep && !setupAccountMismatch() && !state.profileUnavailable && !savingProfile && !checkingProfile && isCompanionProfile(state.user.profile);
  function open({ automatic = false } = {}) {
    if (disposed) return;
    if (!panel.open) { openedByLock = automatic; panel.showModal(); }
    else if (!automatic) openedByLock = false;
  }
  function lock() { main.inert = true; onLock(); open({ automatic: true }); }
  function renderRetry() {
    clearTimeout(retryTimer); retryTimer = null;
    const seconds = Math.max(0, Math.ceil(((state?.requestRetryAt || 0) - Date.now()) / 1000));
    const button = find('[data-request-submit]');
    button.disabled = state.busy || signingIn || !state.ready || (authMode === 'email' && seconds > 0);
    button.textContent = state.busy || signingIn ? '확인 중…' : authMode === 'password' ? '로그인' : seconds ? `메일 다시 요청 (${seconds}초)` : '인증 메일 받기';
    if (seconds && authMode === 'email' && !disposed) retryTimer = setTimeout(renderRetry, 1000);
  }
  function renderProfile() {
    const identity = state?.phase === 'signed-in' ? state.user : null;
    const complete = isCompanionProfile(identity?.profile);
    const unavailable = !identity || !state.ready || state.busy || state.profileUnavailable || savingProfile || checkingProfile || savingPassword || passwordStep || setupAccountMismatch();
    profileForm.hidden = !identity || complete || logoutIntent || state.profileUnavailable || checkingProfile || passwordStep || setupAccountMismatch();
    panel.classList.toggle('is-onboarding', !profileForm.hidden);
    // The email/password stages need no atlas images or 120 hidden choices.
    // Keep selection in the existing state, and allocate the grid only while
    // the common profile form is actually on screen.
    if (profileForm.hidden) releaseCats();
    else populateCats();
    for (const [coat, button] of coatChoices) {
      button.disabled = unavailable;
      button.setAttribute('aria-pressed', String(coat === selectedCoat));
    }
    for (const [id, { label, radio, coats }] of catChoices) {
      label.hidden = selectedCoat !== 'all' && !coats.includes(selectedCoat);
      radio.checked = selectedCat === id; radio.disabled = unavailable || label.hidden;
      label.classList.toggle('is-selected', radio.checked);
    }
    mbti.value = selectedMbti; mbti.disabled = unavailable;
    const chosen = getCompanion(selectedCat);
    find('[data-cat-selected]').textContent = chosen ? `${chosen.name}와 함께 들을게요.` : '위아래로 움직여 나와 닮은 고양이를 골라 주세요.';
    const save = find('[data-profile-save]');
    save.disabled = unavailable || !isCompanionProfile({ catId: selectedCat, mbti: selectedMbti });
    save.textContent = savingProfile || (identity && state.busy) ? '선택을 기억하고 있어요…' : '선택하고 음악 듣기';
    const summary = find('[data-profile-label]'); summary.hidden = !complete;
    summary.textContent = complete ? `${getCompanion(identity.profile.catId).name} · ${identity.profile.mbti}` : '';
  }
  function render(next) {
    state = next;
    const identity = state.phase === 'signed-in' ? state.user : null;
    if (passwordStep && identity && !setupOwner) setupOwner = identity.id;
    if (authenticated()) {
      rememberVerifiedEmail(state.user.email);
      if (passwordStep && !logoutIntent && !setupAccountMismatch() && !setupAttempt) {
        const pending = readPasswordSetup();
        setupAttempt = pending?.userId === identity.id ? pending : beginPasswordSetup(identity);
      }
    }
    if (identity && profileOwner !== identity.id) {
      clearPasswordInputs({ invalidate: true });
      profileOwner = identity.id; selectedCat = ''; selectedMbti = ''; selectedCoat = 'all'; profileError = ''; savingProfile = false; saveEpoch++;
    } else if (state.phase === 'signed-out' || state.phase === 'code-sent') {
      if (profileOwner) clearPasswordInputs({ invalidate: true });
      profileOwner = null; selectedCat = ''; selectedMbti = ''; selectedCoat = 'all'; profileError = ''; notifiedUser = null; savingProfile = false; saveEpoch++;
    }
    const signed = canUse(), userId = signed ? state.user.id : null;
    if (lastUser && lastUser !== userId) onLock();
    const becameSignedIn = userId && userId !== notifiedUser;
    lastUser = userId;
    main.inert = !signed;
    entry.textContent = identity ? '내 계정' : '로그인';
    find('[data-close]').hidden = !signed;
    form.hidden = Boolean(identity) || logoutIntent; find('[data-signed]').hidden = !identity || logoutIntent;
    find('[data-continue]').hidden = !signed;
    find('[data-email]').textContent = identity ? identity.email : '';
    const unavailableProfile = Boolean(identity && state.profileUnavailable);
    const mismatchedAccount = setupAccountMismatch(), passwordOnboarding = Boolean(identity && passwordStep && !mismatchedAccount);
    const restoreMissing = Boolean(expectedUserId && state.ready && !state.busy && state.phase === 'signed-out' && !identity);
    const onboarding = identity && !passwordOnboarding && !mismatchedAccount && !unavailableProfile && !isCompanionProfile(identity.profile);
    find('#account-heading').textContent = mismatchedAccount ? '계정을 다시 확인해 주세요.' : passwordOnboarding ? '비밀번호 만들기·재설정' : unavailableProfile ? '공통 프로필을 확인할게요.' : onboarding ? '나와 닮은 고양이.' : '하나의 계정으로.';
    find('[data-account-intro]').textContent = mismatchedAccount ? '메일에서 확인한 계정과 현재 로그인된 계정이 다릅니다. 현재 계정에서 로그아웃한 뒤 확인한 계정으로 다시 진행해 주세요.' : passwordOnboarding ? '메일 인증이 끝났습니다. 앞으로 로그인할 때 사용할 비밀번호를 설정해 주세요.' : unavailableProfile ? '로그인은 유지되고 있습니다. MEOW와 SCYL에서 함께 쓰는 선택을 다시 확인해 주세요.' : onboarding ? '고양이를 고르고, 나의 MBTI를 알려 주세요. MEOW와 SCYL에서 같은 선택으로 함께해요.' : 'MEOW와 SCYL을 같은 이메일로 이용하세요. 기존 MEOW 회원은 다시 가입하지 않아도 됩니다.';
    if (restoreMissing) {
      find('#account-heading').textContent = '로그인을 다시 이어가세요.';
      find('[data-account-intro]').textContent = '이 브라우저의 로그인 정보를 복원하지 못했습니다. 확인했던 같은 계정으로 다시 로그인하면 이어갈 수 있어요.';
    }
    const sent = state.phase === 'code-sent';
    if (sent) authMode = 'email';
    codeSection.hidden = !sent; if (!sent && codeSection.open) codeSection.open = false;
    code.required = sent && codeSection.open;
    email.disabled = state.busy || signingIn || sent || !state.ready;
    find('[data-password-field]').hidden = authMode !== 'password';
    password.disabled = authMode !== 'password' || state.busy || signingIn || !state.ready;
    password.required = authMode === 'password';
    find('[data-email-mode]').hidden = authMode === 'email';
    find('[data-password-mode]').hidden = authMode === 'password';
    find('[data-email-mode]').disabled = find('[data-password-mode]').disabled = state.busy || signingIn || !state.ready;
    find('[data-auth-help]').textContent = authMode === 'password' ? '이 기기에서는 로그인을 유지합니다.' : '메일로 본인 확인 후 비밀번호를 만들 수 있어요. 이미 비밀번호가 있다면 그대로 계속할 수 있습니다.';
    code.disabled = state.busy || !sent || !codeSection.open;
    find('[data-request-submit]').hidden = sent;
    renderRetry();
    find('[data-code-submit]').disabled = state.busy || !state.ready;
    find('[data-code-submit]').textContent = state.busy ? '확인 중…' : '코드로 로그인';
    find('[data-change]').hidden = !sent; find('[data-change]').disabled = state.busy;
    find('[data-logout]').disabled = state.busy || savingProfile || savingPassword;
    find('[data-retry-logout]').hidden = !logoutIntent || signed || state.busy;
    find('[data-retry-logout]').disabled = state.busy;
    find('[data-retry-profile]').hidden = (!unavailableProfile && !checkingProfile) || logoutIntent;
    find('[data-retry-profile]').disabled = checkingProfile || savingPassword || state.busy || !state.ready;
    find('[data-retry-profile]').textContent = checkingProfile ? '공통 프로필 확인 중…' : '공통 프로필 다시 확인';
    find('[data-message]').textContent = unavailableProfile ? state.message || '공통 프로필을 확인하지 못했습니다. 다시 확인해 주세요.' : loginError || profileError || (state.errorCode ? state.message : onboarding ? savingPassword ? '계정의 비밀번호를 저장하고 있습니다.' : savingProfile || state.busy ? '두 앱에서 함께 쓸 선택을 저장하고 있습니다.' : '로그인되었습니다. 아래 두 가지를 선택하면 음악 화면으로 이동합니다.' : initialMessage && !signed ? initialMessage : state.message || (signed ? 'MEOW · SCYL 공통 계정으로 로그인했습니다.' : state.ready ? authMode === 'password' ? '이메일과 비밀번호로 로그인하세요.' : '이메일로 인증 메일을 보내드립니다.' : '계정을 확인하고 있습니다.'));
    find('[data-message]').setAttribute('role', loginError || profileError || state.errorCode || initialMessage ? 'alert' : 'status');
    if (mismatchedAccount) {
      find('[data-message]').textContent = '확인한 계정이 일치하기 전에는 비밀번호와 회원 정보를 저장하지 않습니다.';
      find('[data-message]').setAttribute('role', 'alert');
    } else if (restoreMissing && !state.errorCode && !loginError) {
      find('[data-message]').textContent = email.value ? '이메일을 자동으로 채웠습니다. 비밀번호로 로그인하거나 처음 가입 · 비밀번호 찾기로 이어가 주세요.' : '확인했던 계정으로 다시 로그인해 주세요. 로그인 정보가 없으면 비밀번호를 설정할 수 없습니다.';
      find('[data-message]').setAttribute('role', 'alert');
    } else if (passwordOnboarding) {
      find('[data-message]').textContent = savingPassword ? '비밀번호를 저장하고 있습니다.' : '비밀번호를 저장하면 다음 단계로 이어집니다. 기존 비밀번호를 그대로 사용해도 됩니다.';
      find('[data-message]').setAttribute('role', 'status');
    } else if (sent && !state.errorCode) {
      find('[data-message]').textContent = native ? '메일의 승인 버튼을 누른 뒤 SCYL 앱으로 돌아오면 비밀번호 설정을 이어갈 수 있어요.' : '메일의 승인 버튼을 누른 뒤 확인된 이메일과 비밀번호 만들기·재설정 버튼을 확인해 주세요.';
    }
    renderProfile();
    const passwordUnavailable = !authenticated() || mismatchedAccount || savingPassword || savingProfile || checkingProfile || logoutIntent;
    passwordSettings.hidden = mismatchedAccount;
    passwordSettings.classList.toggle('is-password-step', passwordOnboarding);
    passwordSettings.querySelector('summary').hidden = passwordOnboarding;
    if (passwordOnboarding && !passwordSettings.open) passwordSettings.open = true;
    find('[data-password-existing]').hidden = !passwordOnboarding;
    find('[data-password-existing]').disabled = passwordUnavailable;
    for (const input of passwordForm.querySelectorAll('input')) input.disabled = passwordUnavailable;
    find('[data-password-save]').disabled = passwordUnavailable;
    find('[data-password-save]').textContent = savingPassword ? '비밀번호 저장 중…' : passwordOnboarding ? '비밀번호 저장하고 계속' : '비밀번호 저장';
    find('[data-password-message]').textContent = passwordMessage;
    find('[data-password-message]').setAttribute('role', passwordError ? 'alert' : 'status');
    if (!signed) open({ automatic: true });
    if (becameSignedIn) { notifiedUser = userId; panel.close(); onSignedIn(state.user); }
    else if (signed && openedByLock) panel.close();
    inbox?.stateChanged();
  }
  panel.addEventListener('cancel', event => { if (!canUse()) event.preventDefault(); });
  panel.addEventListener('close', () => { openedByLock = false; clearPasswordInputs({ invalidate: true }); if (!canUse()) open({ automatic: true }); });
  entry.addEventListener('click', open);
  for (const selector of ['[data-close]', '[data-continue]']) find(selector).addEventListener('click', () => { if (canUse()) panel.close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!account || state.busy || signingIn || !state.ready) return;
    initialMessage = ''; loginError = '';
    if (state.phase === 'code-sent') { if (!codeSection.open) return; const result = await account.verifyCode(code.value); if (result.ok && canUse()) panel.close(); }
    else if (authMode === 'email') { passwordStep = true; const result = await account.requestCode(email.value); if (result.ok) { const notice = find('[data-message]'); notice.tabIndex = -1; notice.focus(); } }
    else {
      if (!password.value) { loginError = '비밀번호를 입력해 주세요.'; render(state); return; }
      const operation = ++loginEpoch; signingIn = true; render(state);
      try {
        const result = await account.signInWithPassword(email.value, password.value);
        if (disposed || operation !== loginEpoch) return;
        if (!result.ok) loginError = result.message || '로그인하지 못했습니다. 이메일과 비밀번호를 확인해 주세요.';
      } catch {
        if (!disposed && operation === loginEpoch) loginError = '로그인하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.';
      } finally {
        if (operation === loginEpoch) {
          password.value = '';
          if (!disposed) { signingIn = false; render(account.getState()); }
        }
      }
    }
  });
  function switchAuthMode(mode) {
    if (!account || state.busy || state.user || signingIn || savingPassword || savingProfile || checkingProfile || !state.ready) return;
    authMode = mode; initialMessage = ''; loginError = ''; code.value = ''; password.value = '';
    cancelPasswordAttempt();
    account.changeEmail(); render(account.getState());
  }
  find('[data-email-mode]').addEventListener('click', () => switchAuthMode('email'));
  find('[data-password-mode]').addEventListener('click', () => switchAuthMode('password'));
  codeSection.addEventListener('toggle', () => { code.required = state?.phase === 'code-sent' && codeSection.open; code.disabled = state?.busy || !code.required; });
  mbti.addEventListener('change', () => {
    if (disposed || passwordStep || setupAccountMismatch() || state?.busy || state?.profileUnavailable || savingProfile || checkingProfile || savingPassword) return;
    selectedMbti = mbti.value; profileError = ''; render(state);
  });
  profileForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!account || !authenticated() || passwordStep || setupAccountMismatch() || state.profileUnavailable || savingProfile || checkingProfile || savingPassword || state.user.id !== profileOwner || !isCompanionProfile({ catId: selectedCat, mbti: selectedMbti })) return;
    const owner = profileOwner, operation = ++saveEpoch;
    savingProfile = true; profileError = ''; render(state);
    try {
      const result = await account.saveProfile({ catId: selectedCat, mbti: selectedMbti });
      if (disposed || operation !== saveEpoch || profileOwner !== owner) return;
      if (!result.ok) profileError = result.message || '선택을 저장하지 못했어요. 다시 시도해 주세요.';
    } catch {
      if (!disposed && operation === saveEpoch && profileOwner === owner) profileError = '선택을 저장하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.';
    } finally {
      if (operation === saveEpoch) {
        savingProfile = false;
        if (!disposed && profileOwner === owner) render(account.getState());
      }
    }
  });
  find('[data-retry-profile]').addEventListener('click', async () => {
    if (!account || disposed || checkingProfile || savingPassword || state.busy || !state.ready || !state.profileUnavailable) return;
    checkingProfile = true; profileError = ''; render(state);
    try { await account.refresh(); }
    catch { if (!disposed) profileError = '공통 프로필을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 눌러 주세요.'; }
    finally { checkingProfile = false; if (!disposed) render(account.getState()); }
  });
  passwordSettings.addEventListener('toggle', () => {
    if (disposed) return;
    // A toggle event must not write the same open attribute again. Some
    // browser event queues can otherwise keep scheduling redundant toggles.
    if (passwordStep && state?.user && !setupAccountMismatch()) {
      if (!passwordSettings.open) passwordSettings.open = true;
      return;
    }
    if (!passwordSettings.open) { passwordForm.elements.newPassword.value = ''; passwordForm.elements.confirmPassword.value = ''; }
  });
  find('[data-password-existing]').addEventListener('click', () => {
    if (!authenticated() || !passwordStep || setupAccountMismatch() || savingPassword || savingProfile || checkingProfile || logoutIntent) return;
    const owner = state.user.id;
    clearPasswordInputs({ invalidate: true }); finishPasswordStep(owner); render(state);
  });
  passwordForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (!account || !authenticated() || setupAccountMismatch() || savingPassword || savingProfile || checkingProfile || logoutIntent) return;
    passwordError = true;
    if (passwordForm.elements.newPassword.value.length < PASSWORD_MIN_LENGTH) {
      passwordMessage = `새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상으로 입력해 주세요.`; render(state); return;
    }
    if (passwordForm.elements.newPassword.value !== passwordForm.elements.confirmPassword.value) {
      passwordMessage = '새 비밀번호와 확인 값이 다릅니다.'; render(state); return;
    }
    const owner = state.user.id, operation = ++passwordEpoch, finishingStep = passwordStep, attempt = setupAttempt;
    savingPassword = true; passwordMessage = ''; passwordError = false; render(state);
    try {
      const result = await account.setPassword(passwordForm.elements.newPassword.value);
      if (disposed || operation !== passwordEpoch || state.user?.id !== owner) return;
      passwordError = !result.ok;
      passwordMessage = result.ok ? '비밀번호를 저장했습니다. 다음에는 이메일과 비밀번호로 로그인할 수 있어요.' : result.message || '비밀번호를 저장하지 못했습니다. 다시 시도해 주세요.';
      if (result.ok && finishingStep) { finishPasswordStep(owner, attempt); passwordSettings.open = false; panel.scrollTop = 0; }
    } catch {
      if (!disposed && operation === passwordEpoch && state.user?.id === owner) { passwordError = true; passwordMessage = '비밀번호를 저장하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.'; }
    } finally {
      if (operation === passwordEpoch) {
        passwordForm.elements.newPassword.value = ''; passwordForm.elements.confirmPassword.value = '';
        if (!disposed) { savingPassword = false; render(account.getState()); }
      }
    }
  });
  find('[data-change]').addEventListener('click', () => {
    if (!account || disposed || state.busy || state.user || !state.ready) return;
    cancelPasswordAttempt(); initialMessage = ''; code.value = ''; account.changeEmail(); email.focus();
  });
  async function logout() {
    if (!account || state?.busy || savingProfile || savingPassword) return;
    clearPasswordInputs({ invalidate: true }); authMode = 'password';
    cancelPasswordAttempt();
    logoutIntent = true; notifiedUser = null; inbox?.cancelPending(); onLock();
    const result = await account.signOut();
    if (disposed) return;
    logoutIntent = !result.ok; render(account.getState());
  }
  find('[data-logout]').addEventListener('click', () => { void logout(); });
  find('[data-retry-logout]').addEventListener('click', () => { void logout(); });
  // Returning from a mailbox must preserve a pending email/code challenge.
  const visible = () => { if (!document.hidden && account && state?.phase === 'signed-in' && !state.busy && !logoutIntent) void account.refresh(); };
  document.addEventListener('visibilitychange', visible);
  const hide = event => { if (!event.persisted) dispose(); };
  addEventListener('pagehide', hide);
  function dispose() {
    if (disposed) return;
    clearPasswordInputs({ invalidate: true });
    disposed = true; releaseCats(); saveEpoch++; clearTimeout(retryTimer); inbox?.dispose(); unsubscribe?.(); account?.dispose();
    document.removeEventListener('visibilitychange', visible); removeEventListener('pagehide', hide);
    void nativeHandle?.remove();
  }
  let ready = Promise.resolve();
  try {
    account = createAccount({ ...config, createClient, flowType: native ? 'pkce' : 'implicit', redirectTo: ACCOUNT_CALLBACK + (native ? '?target=native' : '') });
    inbox = createAccountLinkInbox({ account, onResult(result) {
      if (result.code === 'already_signed_in' && !passwordSetup) { finishPasswordStep(state?.user?.id); setupOwner = null; render(account.getState()); }
      if (!result.ok && result.code !== 'already_signed_in') {
        find('[data-message]').textContent = result.message;
        find('[data-message]').setAttribute('role', 'alert');
      }
    } });
    if (completionCode) inbox.receive(completionCode);
    unsubscribe = account.subscribe(render); lock();
    // Register warm-link listeners immediately; never wait for a network user
    // check before listening. The inbox waits until that check is ready.
    const nativeReady = native ? (async () => {
      const App = await loadNativeApp();
      if (disposed) return;
      const receive = ({ url } = {}) => {
        const code = readAccountCode(url, { native: true });
        if (code && inbox.receive(code) && !state?.user) { passwordStep = true; if (state) render(state); }
      };
      const handle = await App.addListener('appUrlOpen', receive);
      if (disposed) { await handle.remove(); return; }
      nativeHandle = handle;
      receive(await App.getLaunchUrl());
    })() : Promise.resolve();
    ready = Promise.all([account.start(), nativeReady]).catch(() => {
      if (disposed) return;
      find('[data-message]').textContent = '메일 인증을 완료하지 못했습니다. 인증 메일을 요청했던 앱에서 다시 시도해 주세요.';
      find('[data-message]').setAttribute('role', 'alert');
    });
  }
  catch { lock(); form.hidden = true; find('[data-message]').textContent = '계정 연결 설정을 확인하지 못했습니다. 잠시 후 다시 열어 주세요.'; }
  return { configured: true, canUse, open, ready, dispose, require() { if (canUse()) return true; open(); return false; } };
}
