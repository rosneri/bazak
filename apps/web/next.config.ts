import type { NextConfig } from "next";
import { browserSecurityHeaders } from "../shared/browser-security";

const fixture = process.env.SHOPPER_BUILD_PROFILE === "fixture";

const config: NextConfig = {
  distDir: fixture ? ".next-fixture" : ".next",
  poweredByHeader: false,
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/(.*)", headers: browserSecurityHeaders }];
  },
  turbopack: {
    resolveAlias: {
      "@bazak/services": fixture
        ? "./src/server/services.test.ts"
        : "./src/server/services.production.ts",
    },
  },
};

export default config;
