import type { NextConfig } from "next";

// Headers that never change. The Content-Security-Policy needs a fresh nonce per request, so src/proxy.ts sets it.
const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // Location is used on the new post page to drop the map pin; camera and microphone aren't used.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  // One small Node.js server with only the files it needs, for the container image (see Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    // Profiles live at /@handle, like X. The page itself is app/u/[handle].
    return [{ source: "/@:handle", destination: "/u/:handle" }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
