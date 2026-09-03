// The finished thinking row's label, pure so the component's test can run without the icon module.
//
// 🔴 THE REFERENCE'S WORDING ("Worked for 59s", measured in the owner's ChatGPT 2026-08-31), whole
// seconds, and never under one: a turn that visibly worked took at least a second to do it.

export function workedForLabel(seconds: number): string {
  const whole = Math.max(1, Math.round(seconds));
  if (whole < 60) return `Worked for ${whole}s`;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `Worked for ${minutes}m` : `Worked for ${minutes}m ${rest}s`;
}
