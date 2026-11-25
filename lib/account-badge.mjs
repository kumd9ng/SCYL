import { getCompanion, companionAvatarStyle, isCompanionProfile } from './companion-catalog.mjs';
import { formatMbtiLabel } from './mbti-labels.mjs';

/** Render only the saved profile supplied by the account UI; returns badge validity. */
export function renderAccountBadge(entry, profile) {
  const complete = isCompanionProfile(profile);
  entry.classList.toggle('has-companion', complete);
  if (!complete) {
    entry.textContent = '계정';
    entry.removeAttribute('aria-label');
    entry.removeAttribute('title');
    return false;
  }

  const companion = getCompanion(profile.catId);
  const avatar = entry.ownerDocument.createElement('span');
  avatar.className = 'scyl-account-avatar';
  avatar.setAttribute('aria-hidden', 'true');
  Object.assign(avatar.style, companionAvatarStyle(profile.catId));
  const mbti = entry.ownerDocument.createElement('span');
  mbti.className = 'scyl-account-mbti';
  mbti.textContent = profile.mbti;
  entry.replaceChildren(avatar, mbti);
  const label = `${companion.name} · ${formatMbtiLabel(profile.mbti)} · 내 계정`;
  entry.setAttribute('aria-label', label);
  entry.setAttribute('title', label);
  return true;
}
