/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 15+: instrumentation.ts loads by default, and external server
  // packages moved out of `experimental`.
  serverExternalPackages: ["sharp", "node-cron"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
