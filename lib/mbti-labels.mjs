/** Familiar type nicknames for display, not a personality assessment.
 * Naming reference (checked 2026-11-26):
 * https://www.16personalities.com/ko/성격-유형
 */
export const MBTI_LABELS = Object.freeze({
  INTJ: { ko: '전략가', en: 'Architect' },
  INTP: { ko: '논리술사', en: 'Logician' },
  ENTJ: { ko: '통솔자', en: 'Commander' },
  ENTP: { ko: '변론가', en: 'Debater' },
  INFJ: { ko: '옹호자', en: 'Advocate' },
  INFP: { ko: '중재자', en: 'Mediator' },
  ENFJ: { ko: '선도자', en: 'Protagonist' },
  ENFP: { ko: '활동가', en: 'Campaigner' },
  ISTJ: { ko: '현실주의자', en: 'Logistician' },
  ISFJ: { ko: '수호자', en: 'Defender' },
  ESTJ: { ko: '경영자', en: 'Executive' },
  ESFJ: { ko: '집정관', en: 'Consul' },
  ISTP: { ko: '장인', en: 'Virtuoso' },
  ISFP: { ko: '모험가', en: 'Adventurer' },
  ESTP: { ko: '사업가', en: 'Entrepreneur' },
  ESFP: { ko: '연예인', en: 'Entertainer' },
});

export function formatMbtiLabel(type, locale = 'ko') {
  const label = MBTI_LABELS[type]?.[locale === 'en' ? 'en' : 'ko'];
  return label ? `${type} · ${label}` : type;
}
