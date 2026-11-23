import type { ComponentProps } from "react";
import { cn } from "@bazak/ui/lib/utils";

export function Card({ className, ...props }: ComponentProps<"article">) {
  return (
    <article
      data-slot="card"
      className={cn("rounded-lg border bg-card text-card-foreground", className)}
      {...props}
    />
  );
}
