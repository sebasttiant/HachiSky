import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Enables forbidden() so a module the role may not use answers 403.
    authInterrupts: true,
  },
};

export default nextConfig;
