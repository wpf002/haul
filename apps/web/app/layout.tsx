import { Fraunces, IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';
import { Nav } from './components/Nav';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], variable: '--font-fraunces', axes: ['opsz', 'SOFT'], style: ['normal', 'italic'] });
const text = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' });

export const metadata = { title: 'Haul', description: 'Recipe in, cart out.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable} ${mono.variable}`}>
      <body>
        <header className="topbar">
          <div className="shell">
            <a href="/" className="wordmark" aria-label="Haul home">
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
                <path d="M3 8h20l-2.2 11.2A3 3 0 0 1 17.86 22H8.14a3 3 0 0 1-2.94-2.8L3 8Z" fill="currentColor" />
                <path d="M8.5 8 11 3.5M17.5 8 15 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M9 13.5h8M10 17h6" stroke="var(--accent-fg)" strokeWidth="1.8" strokeLinecap="round" />
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
