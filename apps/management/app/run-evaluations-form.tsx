"use client";

import { useActionState } from "react";
import { Button } from "@bazak/ui/components/button";
import { runEvaluations } from "./run-evaluations";

export function RunEvaluationsForm() {
  const [error, submit, pending] = useActionState(runEvaluations, null);

  return (
    <form action={submit} className="run-evaluations">
      <Button type="submit" disabled={pending}>
        {pending ? "Running evaluations…" : "Run evaluations"}
      </Button>
      {error && !pending && <p role="alert">{error}</p>}
    </form>
  );
}
