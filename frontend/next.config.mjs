/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8020/api/:path*",
      },
      {
        source: "/health",
        destination: "http://127.0.0.1:8020/health",
      },
    ];
  },
};

export default nextConfig;
