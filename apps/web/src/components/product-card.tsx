"use client";

import Image from "next/image";
import { useState } from "react";
import { Card } from "@bazak/ui/components/card";
import type { ProductSnapshot } from "@bazak/product-discovery/domain/product";
import type { MessagePart } from "@bazak/conversation/domain/turn";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function ProductCard({ product }: { product: ProductSnapshot }) {
  const [missing, setMissing] = useState(false);

  return (
    <Card className="product-card">
      <div className="product-media">
        {product.imageUrl && !missing ? (
          <Image
            src={product.imageUrl}
            alt=""
            width={160}
            height={160}
            unoptimized
            onError={() => setMissing(true)}
          />
        ) : (
          <span className="image-fallback" role="img" aria-label="Product image unavailable">
            {product.title
              .split(" ")
              .slice(0, 2)
              .map((word) => word.charAt(0))
              .join("")}
          </span>
        )}
      </div>
      <div className="product-content">
        <h4>{product.title}</h4>
        <span className="price">{dollars.format(product.price)}</span>
        <p>{product.description}</p>
      </div>
    </Card>
  );
}

export function AssistantParts({ parts }: { parts: MessagePart[] }) {
  const occurrences = new Map<string, number>();

  return (
    <div className="assistant-parts">
      {parts.map((part) => {
        const label = part.type === "text" ? "text" : "group/" + part.group.label;
        const occurrence = occurrences.get(label) ?? 0;
        occurrences.set(label, occurrence + 1);
        const key = label + "/" + occurrence;

        if (part.type === "text")
          return (
            <p key={key} className="reply-text">
              {part.text}
            </p>
          );
        const { group } = part;

        return (
          <section className="results" key={key} aria-label={group.label}>
            <h3>{group.label}</h3>
            <p className="group-message">{group.message}</p>
            {group.products.length > 0 && (
              <div className="products">
                {group.products.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
