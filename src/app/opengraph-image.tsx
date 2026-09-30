import { ImageResponse } from 'next/og';
import { config } from '@/lib/blog';

// The sharing image of every page without a cover of its own: the site name and description.
// Replace it with your own design; keep the size, the one link previews expect.
export const alt = config.siteName;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 96,
          background: '#fbfaf7',
          color: '#1c1b18',
        }}
      >
        <div style={{ width: 56, height: 56, borderRadius: 14, border: '6px solid #2753c2', marginBottom: 44 }} />
        <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1.1 }}>{config.siteName}</div>
        {config.description ? <div style={{ fontSize: 36, lineHeight: 1.35, marginTop: 28, color: '#66635b' }}>{config.description}</div> : null}
      </div>
    ),
    size,
  );
}
