/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8888/api/:path*",
      },
      {
        source: "/health",
        destination: "http://127.0.0.1:8888/health",
      },
    ];
  },
};

export default nextConfig;
