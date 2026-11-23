import type { NextConfig } from "next";

const fixture = process.env.SHOPPER_BUILD_PROFILE === "fixture";

const config: NextConfig = {
  distDir: fixture ? ".next-fixture" : ".next",
  turbopack: {
    resolveAlias: {
      "@bazak/services": fixture
        ? "./src/server/services.test.ts"
        : "./src/server/services.production.ts",
    },
  },
};

export default config;
