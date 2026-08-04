import type { ReactNode } from 'react';

export const metadata = {
  title: 'Journal Bot',
  description: 'Telegram → Notion → resúmenes por mail',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          background: '#0b0b0d',
          color: '#f5f5f2',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
