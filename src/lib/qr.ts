/**
 * Puck QR payload — printed on every puck by the provisioning tool.
 * Format (version-prefixed): `DIH1:<uuid>:<major>:<minor>`
 */
export interface PuckIdentity {
  uuid: string;
  major: number;
  minor: number;
}

const PREFIX = 'DIH1:';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatPuckQr(puck: PuckIdentity): string {
  return `${PREFIX}${puck.uuid.toLowerCase()}:${puck.major}:${puck.minor}`;
}

export function parsePuckQr(data: string): PuckIdentity | null {
  if (!data.startsWith(PREFIX)) return null;
  const parts = data.slice(PREFIX.length).split(':');
  if (parts.length !== 3) return null;
  const [uuid, majorRaw, minorRaw] = parts;
  if (!UUID_RE.test(uuid)) return null;
  const major = Number(majorRaw);
  const minor = Number(minorRaw);
  if (
    !Number.isInteger(major) ||
    !Number.isInteger(minor) ||
    major < 0 ||
    major > 65535 ||
    minor < 0 ||
    minor > 65535
  ) {
    return null;
  }
  return { uuid: uuid.toLowerCase(), major, minor };
}
