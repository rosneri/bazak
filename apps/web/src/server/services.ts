import {
  createConversationService,
  type ConversationModel,
} from "@bazak/conversation/application/chat";
import { createConversationManagement } from "@bazak/conversation/application/management";
import type { QueryPlanner } from "@bazak/conversation/application/query-planner";
import type { Clock, ConversationRepository } from "@bazak/conversation/application/repository";
import type { ProductCatalog } from "@bazak/product-discovery/application/catalog";
import { createDiscoveryService } from "@bazak/product-discovery/application/discovery";

export function composeServices(
  repository: ConversationRepository,
  model: ConversationModel,
  queryPlanner: QueryPlanner,
  catalog: ProductCatalog,
  clock: Clock,
) {
  return {
    management: createConversationManagement(repository, clock),
    chat: createConversationService({
      repository,
      model,
      queryPlanner,
      discovery: createDiscoveryService(catalog),
      clock,
    }),
  };
}

export type ShopperServices = ReturnType<typeof composeServices>;
