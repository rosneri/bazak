import { z } from "zod";

export const productSnapshotSchema = z
  .strictObject({
    id: z.string().min(1).describe("The product identifier in the source catalog."),
    title: z.string().min(1).describe("The catalog title shown to the shopper."),
    description: z.string().describe("The catalog's description of the product."),
    price: z.number().nonnegative().describe("The observed unit price in the catalog currency."),
    stock: z.int().nonnegative().describe("How many units the catalog reported in stock."),
    imageUrl: z.httpUrl().optional().describe("The catalog thumbnail URL when available."),
    observedAt: z.iso
      .datetime()
      .describe("The UTC instant the adapter observed these catalog values."),
  })
  .describe("Catalog facts captured together for a product.");

export type ProductSnapshot = z.infer<typeof productSnapshotSchema>;
