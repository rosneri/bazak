import { createRecoveryQueue } from "@bazak/evaluation-store/recovery";
import { database } from "@bazak/evaluation-store/client";
import { recoverExpiredTurns } from "./recover.ts";

const { services } =
  process.env.SHOPPER_BUILD_PROFILE === "fixture"
    ? await import("@bazak/web/fixture-services")
    : await import("@bazak/web/production-services");

const queue = createRecoveryQueue();

async function sweep() {
  try {
    await recoverExpiredTurns(queue, services.chat);
  } catch (error) {
    console.error(
      "Turn recovery scan failed",
      error instanceof Error ? error.name : "Unknown error",
    );
  }
}

let stopping = false;

let active;

function tick() {
  if (!stopping)
    active ??= sweep().finally(() => {
      active = undefined;
    });

  return active;
}

const job = Bun.cron("* * * * *", tick);

async function stop() {
  stopping = true;
  job.stop();
  await active;
  await database.$disconnect();
}

process.once("SIGINT", stop);

process.once("SIGTERM", stop);

await tick();
