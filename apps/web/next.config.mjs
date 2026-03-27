/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // Only enable standalone output for Docker production builds
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
  transpilePackages: [
    "@agentic-academy/db",
    "@agentic-academy/ai",
    "@agentic-academy/types",
  ],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
    instrumentationHook: true,
    workerThreads: false,
    cpus: 1,
  },
};

export default nextConfig;
