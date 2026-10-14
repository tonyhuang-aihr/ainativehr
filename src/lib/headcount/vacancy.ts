/** 空缺不为负。超编时空缺写 0，另标「超编 N 人」。 */

export function presentVacancy(vacancy: number): { slots: number; over: string | null } {
  if (vacancy < 0) return { slots: 0, over: `超编 ${Math.abs(vacancy)} 人` };
  return { slots: vacancy, over: null };
}

export function vacancyPhrase(vacancy: number): string {
  const shown = presentVacancy(vacancy);
  return shown.over ? `空缺 ${shown.slots} · ${shown.over}` : `空缺 ${shown.slots}`;
}
