/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    // BACKEND_HOST lets containerized deployments target the backend service
    // over the compose network; local dev defaults to loopback as before.
    const backendHost = process.env.BACKEND_HOST || "127.0.0.1";
    const backendPort = process.env.BACKEND_PORT || "8020";
    return [
      {
        source: "/api/:path*",
        destination: `http://${backendHost}:${backendPort}/api/:path*`,
      },
      {
        source: "/health",
        destination: `http://${backendHost}:${backendPort}/health`,
      },
    ];
  },
};

export default nextConfig;
