import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // A stray package-lock.json in the home directory made Next infer the
  // workspace root as ~ rather than this project, so its file tracing was
  // walking everything under the home folder. Pinning the root here keeps that
  // correct regardless of what other lockfiles exist on the machine.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
