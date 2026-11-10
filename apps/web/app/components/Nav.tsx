'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const LINKS = [
  { href: '/', label: 'Cart' },
  { href: '/pantry', label: 'Pantry' },
];

export function Nav() {
  const path = usePathname();
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    api.config().then((c) => setDemo(c.demo), (e: unknown) => console.warn('haul: config unavailable', e));
  }, []);

  return (
    <>
      {demo && (
        <span className="demo-flag" title="Sample catalog. Nothing is sent to Kroger or Instacart.">
          Demo
        </span>
      )}
      <nav className="nav" aria-label="Main">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={path === l.href ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
