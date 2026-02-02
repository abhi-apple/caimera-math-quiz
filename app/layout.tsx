import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'Caimera Math Sprint',
  description: 'Competitive math quiz — first correct answer wins.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
