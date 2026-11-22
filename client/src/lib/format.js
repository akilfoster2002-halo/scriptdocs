export function initials(nameOrEmail = '?') {
  const base = String(nameOrEmail).trim();
  if (!base) return '?';
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

export function personName(profile) {
  if (!profile) return 'Unknown';
  return profile.display_name || profile.email || 'Unknown';
}

const UNITS = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
  [4.345, 'week'],
  [12, 'month'],
];

export function relativeTime(iso) {
  if (!iso) return '';
  let delta = (Date.now() - new Date(iso).getTime()) / 1000;
  if (delta < 45) return 'just now';
  for (const [size, unit] of UNITS) {
    if (Math.abs(delta) < size) {
      const n = Math.round(delta);
      return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
    }
    delta /= size;
  }
  const n = Math.round(delta);
  return `${n} year${n === 1 ? '' : 's'} ago`;
}

export function fullDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
