/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const backendPort = process.env.BACKEND_PORT || "8020";
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${backendPort}/api/:path*`,
      },
      {
        source: "/health",
        destination: `http://127.0.0.1:${backendPort}/health`,
      },
    ];
  },
};

export default nextConfig;
