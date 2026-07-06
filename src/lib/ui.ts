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
