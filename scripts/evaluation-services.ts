import type { ConversationModel } from "../packages/features/conversation/src/application/chat.ts";
import type { ConversationRepository } from "../packages/features/conversation/src/application/repository.ts";
import type { EvaluationCase } from "../packages/features/evaluation/src/domain/cases.ts";
import {
  fixtureCatalog,
  fixtureModel,
  fixturePlanner,
  fixtureUsage,
} from "../apps/web/src/server/fixtures.ts";
import { model, planner } from "../apps/web/src/server/sdk.ts";
import { composeServices } from "../apps/web/src/server/services.ts";

const clock = () => new Date();

function services(repository: ConversationRepository, example: EvaluationCase, live: boolean) {
  const catalog = fixtureCatalog(clock);
  const findPage = catalog.findPage;
  let failPage = example.failFirstLookup;
  catalog.findPage = (...args) => {
    if (failPage) {
      failPage = undefined;
      throw new Error("Expected evaluation lookup failure.");
    }

    return findPage(...args);
  };

  const intent: ConversationModel = {
    async decide(input, signal, observe, usage) {
      if (input.text !== example.prompt) return fixtureModel.decide(input, signal, observe, usage);

      if (live) return model.decide(input, signal, observe, usage);

      if (!example.proposal) throw new Error("Missing scripted proposal.");

      usage?.(fixtureUsage);

      return example.proposal;
    },
  };

  return composeServices(repository, intent, live ? planner : fixturePlanner, catalog, clock);
}

export const harnessServices = (repository: ConversationRepository, example: EvaluationCase) =>
  services(repository, example, false);

export const modelServices = (repository: ConversationRepository, example: EvaluationCase) =>
  services(repository, example, true);
