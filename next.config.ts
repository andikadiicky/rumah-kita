import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The development badge overlaps the phone's fixed bottom navigation.
  // Compile and runtime error overlays remain enabled.
  devIndicators: false,
};

export default nextConfig;
