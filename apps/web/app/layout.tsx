import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'Haul', description: 'Any recipe, straight to your cart.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <h1>Haul</h1>
          <span>Any Recipe, Straight To Your Cart</span>
        </header>
        {children}
      </body>
    </html>
  );
}
