// Railway's *.up.railway.app domains are on the public suffix list, so web and
// API on separate subdomains are cross-site and the browser drops the
// SameSite=Lax session cookie. Proxying the API under /api keeps one origin.
const apiOrigin = process.env.API_ORIGIN;

/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@haul/core'],
  poweredByHeader: false,
  async rewrites() {
    return apiOrigin ? [{ source: '/api/:path*', destination: `${apiOrigin}/:path*` }] : [];
  },
};
