import type { ProductCatalog } from "@bazak/product-discovery/application/catalog";

export const scents = [38, 29, 14].map((price, i) => ({
  id: String(i + 1),
  price,
  title: "Perfume " + (i + 1),
  description: "Fresh perfume",
  category: "fragrances",
  stock: 3,
  observedAt: "2026-11-23T12:00:00.000Z",
}));

export const catalog: ProductCatalog = {
  async findPage() {
    return { total: scents.length, offset: 0, products: scents };
  },
  async findById(id) {
    const item = scents.find((p) => p.id === id);

    return item ? { ...item, price: 32, stock: 0 } : null;
  },
};
