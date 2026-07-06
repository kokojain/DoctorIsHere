export const palette = {
  primary: '#208AEF',
  primaryDark: '#0F6BC4',
  present: '#1DA457',
  presentBg: '#E7F7EE',
  away: '#8A93A2',
  awayBg: '#F0F2F5',
  unconfirmed: '#C77D0A',
  unconfirmedBg: '#FCF3E3',
  danger: '#D64545',
  text: '#16202C',
  textMuted: '#5C6875',
  card: '#FFFFFF',
  background: '#F5F7FA',
  border: '#E3E8EF',
};

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} ${h === 1 ? 'hour' : 'hours'}`;
  return `${h} h ${m} m`;
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Soft iOS card shadow. */
export const cardShadow = {
  shadowColor: '#16202C',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.06,
  shadowRadius: 12,
} as const;
