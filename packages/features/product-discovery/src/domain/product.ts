import { z } from "zod";

export const productSnapshotSchema = z
  .strictObject({
    id: z
      .string()
      .min(1)
      .describe("The product identifier in the source catalog.")
      .meta({ title: "Catalog product ID" }),
    title: z
      .string()
      .min(1)
      .describe("The catalog title shown to the shopper.")
      .meta({ title: "Product title" }),
    description: z
      .string()
      .describe("The catalog's description of the product.")
      .meta({ title: "Product description" }),
    price: z
      .number()
      .nonnegative()
      .describe("The observed unit price in the catalog currency.")
      .meta({ title: "Observed price" }),
    stock: z
      .int()
      .nonnegative()
      .describe("How many units the catalog reported in stock.")
      .meta({ title: "Observed stock" }),
    imageUrl: z
      .httpUrl()
      .optional()
      .describe("The catalog thumbnail URL when available.")
      .meta({ title: "Product thumbnail" }),
    observedAt: z.iso
      .datetime()
      .describe("The UTC instant the adapter observed these catalog values.")
      .meta({ title: "Catalog observation time" }),
  })
  .describe("Catalog facts captured together for a product.")
  .meta({ title: "Product snapshot" });

export type ProductSnapshot = z.infer<typeof productSnapshotSchema>;
