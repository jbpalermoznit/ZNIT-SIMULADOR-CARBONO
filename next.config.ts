import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Allowed origins for connect-src. Clerk + Supabase are added here.
const connectSrc = [
  "'self'",
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.clerk.accounts.dev",
  "https://*.clerk.com",
  "https://clerk-telemetry.com",
  isDev ? "ws://localhost:*" : "",
]
  .filter(Boolean)
  .join(" ");

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  isDev ? "'unsafe-eval'" : "",
  "https://*.clerk.accounts.dev",
  "https://*.clerk.com",
  "https://challenges.cloudflare.com",
]
  .filter(Boolean)
  .join(" ");

const cspDirectives = [
  `default-src 'self'`,
  `script-src ${scriptSrc}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https://*.clerk.com https://img.clerk.com`,
  `font-src 'self' data:`,
  `connect-src ${connectSrc}`,
  `frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com`,
  `worker-src 'self' blob:`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
