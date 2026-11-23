import { ShoppingChat } from "@/src/components/shopping-chat";

export const dynamic = "force-dynamic";

export default async function ConversationPage({ params }: PageProps<"/conversations/[id]">) {
  const { id } = await params;

  return <ShoppingChat key={id} initialId={id} />;
}
