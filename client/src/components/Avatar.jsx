import { initials, personName } from '../lib/format.js';

export default function Avatar({ profile, size = 32, title }) {
  const name = personName(profile);
  return (
    <span
      className="avatar"
      style={{
        background: profile?.color || '#5f6368',
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
      }}
      title={title || name}
      aria-label={name}
    >
      {initials(profile?.display_name || profile?.email)}
    </span>
  );
}
