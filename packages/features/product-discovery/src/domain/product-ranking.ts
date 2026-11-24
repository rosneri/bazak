import type { DiscoveryCriteria } from "@bazak/product-discovery/domain/discovery";
import type { ProductSnapshot } from "@bazak/product-discovery/domain/product";

export const cents = (price: number) => Math.round(price * 100);

export function matchesDiscoveryCriteria(product: ProductSnapshot, criteria: DiscoveryCriteria) {
  const price = cents(product.price);

  const ceiling =
    criteria.maxPrice === undefined
      ? Infinity
      : cents(criteria.maxPrice) - (criteria.priceBoundary === "exclusive" ? 1 : 0);

  const searchable = [product.title, product.description, product.category].join(" ").toLowerCase();

  return (
    product.stock > 0 &&
    price <= ceiling &&
    (!criteria.category || product.category === criteria.category) &&
    (!criteria.keywords ||
      criteria.keywords
        .toLowerCase()
        .split(/\s+/)
        .every((word) => searchable.includes(word)))
  );
}

export function rankMatchingProducts(
  snapshots: Iterable<ProductSnapshot>,
  preferred: ReadonlySet<string>,
  criteria: DiscoveryCriteria,
  preferredPriceOrder?: DiscoveryCriteria["priceOrder"] | null,
) {
  const products = Array.from(snapshots).filter((product) =>
    matchesDiscoveryCriteria(product, criteria),
  );

  const order = criteria.priceOrder ?? preferredPriceOrder;
  products.sort((a, b) => {
    const preference = Number(preferred.has(b.id)) - Number(preferred.has(a.id));

    const priceDifference =
      order === "ascending"
        ? cents(a.price) - cents(b.price)
        : order === "descending"
          ? cents(b.price) - cents(a.price)
          : 0;

    return criteria.priceOrder ? priceDifference : preference || priceDifference;
  });

  return products.slice(0, criteria.count ?? 3);
}
