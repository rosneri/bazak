import { createConversationRepository } from "@bazak/evaluation-store/conversations";
import type { Clock, ConversationRepository } from "@bazak/conversation/application/repository";
import { fixtureModel, fixturePlanner, fixtureCatalog } from "./fixtures.ts";
import { composeServices } from "./services.ts";

export function createFixtureServices(
  repository: ConversationRepository,
  clock: Clock = () => new Date(),
) {
  return composeServices(repository, fixtureModel, fixturePlanner, fixtureCatalog(clock), clock);
}

export const services = createFixtureServices(createConversationRepository());
