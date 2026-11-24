import { Card } from "@bazak/ui/components/card";

export function ProductSkeleton({ label }: { label: string }) {
  return (
    <section className="results" aria-label={`Loading products for ${label}`} aria-busy="true">
      <h3>{label}</h3>
      <Card className="product-card lookup-placeholder" aria-hidden="true">
        <div className="product-media" />
        <div className="placeholder-lines">
          <i />
          <i />
          <i />
        </div>
      </Card>
    </section>
  );
}
