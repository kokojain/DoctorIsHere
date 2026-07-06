// Generates puck-qr.html — a printable sheet of QR codes for the demo pucks
// (major 1, minors 1–5). In production the provisioning tool prints these
// labels onto the pucks themselves.
// Usage: node scripts/generate-puck-qr.mjs && open puck-qr.html
import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';

const UUID = (process.env.EXPO_PUBLIC_BEACON_UUID ?? '2F234454-CF6D-4A0F-ADF2-F4911BA9FFA6')
  .toLowerCase();
const MAJOR = 1;
const MINORS = [1, 2, 3, 4, 5];

const cells = await Promise.all(
  MINORS.map(async (minor) => {
    const payload = `DIH1:${UUID}:${MAJOR}:${minor}`;
    const dataUrl = await QRCode.toDataURL(payload, { width: 280, margin: 2 });
    return `
      <div class="puck">
        <img src="${dataUrl}" alt="Puck ${MAJOR}-${minor}" />
        <h2>DoctorIsHere Puck #${MAJOR}-${minor}</h2>
        <code>${payload}</code>
      </div>`;
  })
);

writeFileSync(
  new URL('../puck-qr.html', import.meta.url),
  `<!doctype html><html><head><meta charset="utf-8"><title>DoctorIsHere demo puck QR codes</title>
<style>
  body { font-family: -apple-system, sans-serif; display: flex; flex-wrap: wrap; gap: 24px; padding: 24px; }
  .puck { text-align: center; border: 1px solid #ddd; border-radius: 12px; padding: 16px; }
  h2 { font-size: 16px; margin: 8px 0 4px; }
  code { font-size: 10px; color: #888; }
</style></head><body>${cells.join('\n')}</body></html>`
);
console.log('Wrote puck-qr.html — open it and scan the codes from the screen.');
