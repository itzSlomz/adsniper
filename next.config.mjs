/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["sharp", "node-cron"],
  },
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
