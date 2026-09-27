import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo already has a root AGENTS.md. Next's generated copy would sit
  // beside it and get rewritten on every `next dev`.
  agentRules: false,
};

export default nextConfig;
