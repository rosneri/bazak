import { createConversationController } from "./http.ts";
import { consoleConversationTransportLogger } from "./logger.ts";
import type { ShopperServices } from "./services.ts";

let services: ShopperServices | undefined;

export const routes = createConversationController({
  async getServices() {
    services ??= (await import("@bazak/services")).services;

    return services;
  },
  logger: consoleConversationTransportLogger,
  port: process.env.PORT ?? "3000",
});
