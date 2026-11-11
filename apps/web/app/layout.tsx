import { Fraunces, IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Nav } from './components/Nav';
import { BRAND, MARK } from './lib/mark';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz', 'SOFT'], style: ['normal', 'italic'] });
const text = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

export const metadata: Metadata = {
  title: 'Haul',
  description: 'Recipe in, cart out.',
  appleWebApp: { capable: true, title: 'Haul', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: BRAND.paper },
    { media: '(prefers-color-scheme: dark)', color: BRAND.night },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body>
        <header className="topbar">
          <div className="shell">
            <a href="/" className="wordmark" aria-label="Haul home">
              <svg width="26" height="26" viewBox={MARK.viewBox} fill="none" aria-hidden="true">
                <path d={MARK.basket} fill="currentColor" />
                <path d={MARK.handles} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d={MARK.slats} stroke="var(--accent-fg)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Haul
            </a>
            <Nav />
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
