import { createDummyJsonCatalog } from "@bazak/dummyjson";
import { createConversationRepository } from "@bazak/evaluation-store/conversations";
import type { Clock, ConversationRepository } from "@bazak/conversation/application/repository";
import { model, planner } from "./sdk.ts";
import { composeServices } from "./services.ts";

export function createProductionServices(
  repository: ConversationRepository,
  clock: Clock = () => new Date(),
) {
  return composeServices(repository, model, planner, createDummyJsonCatalog(fetch), clock);
}

export const services = createProductionServices(createConversationRepository());
