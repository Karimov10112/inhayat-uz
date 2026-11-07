import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.BACKEND_INTERNAL_URL || "http://localhost:4000"}/api/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Content-Security-Policy', value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; frame-src https://maps.google.com https://www.google.com" },
    ] }, { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] }];
  }
};

export default nextConfig;
