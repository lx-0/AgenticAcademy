/** @type {import('next').NextConfig} */
const nextConfig = {
  // Only enable standalone output for Docker production builds
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" } : {}),
  transpilePackages: [
    "@agentic-academy/db",
    "@agentic-academy/ai",
    "@agentic-academy/types",
  ],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "bcryptjs"],
  },
};

export default nextConfig;
