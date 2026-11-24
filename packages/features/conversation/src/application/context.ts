import type { DiscoveryCriteria } from "@bazak/product-discovery/domain/discovery";
import type { Turn } from "@bazak/conversation/domain/turn";
import { groundedKeywords, maxGroups, searchLabel } from "#application/model-decision";

export interface ContextTurn {
  text: string;
  groups: {
    label: string;
    criteria: Omit<DiscoveryCriteria, "keywords"> | null;
    retryGroup: number | null;
    products: { id: string; title: string; price: number }[];
  }[];
}

export function productGroupsOf(turn: Turn) {
  return (
    turn.assistant?.parts
      .flatMap((part) => (part.type === "products" ? [part.group] : []))
      .slice(0, maxGroups) ?? []
  );
}

export function recentContext(turns: Turn[]): ContextTurn[] {
  return turns.map((turn, turnIndex) => ({
    text: turn.text.slice(0, 500),
    groups: productGroupsOf(turn).map((group, index) => {
      const { keywords, ...criteria } = group.criteria ?? {};
      const grounded = keywords && groundedKeywords(keywords, turn.text);

      return {
        label: searchLabel(grounded ? { ...criteria, keywords: grounded } : criteria),
        criteria: group.criteria ? criteria : null,
        retryGroup:
          group.kind === "lookup-error" && group.criteria ? turnIndex * maxGroups + index : null,
        products: group.products
          .filter(({ id }) => id.length <= 80)
          .map(({ id, title, price }) => ({ id, title: title.slice(0, 100), price })),
      };
    }),
  }));
}
