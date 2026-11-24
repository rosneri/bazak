import Link from "next/link";
import { Button } from "@bazak/ui/components/button";
import type { ShoppingSession } from "../client/chat-session";

const activityDate = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function SavedChats({ session, menu }: { session: ShoppingSession; menu: boolean }) {
  const { busy, id, list, listLoading, newChat } = session;

  return (
    <aside id="chat-history" className={menu ? "sidebar open" : "sidebar"}>
      <div className="sidebar-top">
        <h2>Saved chats</h2>
        <Button variant="outline" onClick={newChat} disabled={busy} className="new-chat">
          <span aria-hidden="true">＋</span> New chat
        </Button>
      </div>
      <nav aria-label="Chat history">
        {list.map((chat) => (
          <Link
            href={"/conversations/" + chat.id}
            key={chat.id}
            aria-current={chat.id === id ? "page" : undefined}
          >
            <span>{chat.title}</span>
            <time dateTime={chat.updatedAt}>{activityDate.format(new Date(chat.updatedAt))}</time>
          </Link>
        ))}
      </nav>
      {!list.length && (
        <p className="sidebar-note">
          {listLoading ? "Loading chats…" : "Your conversations will appear here."}
        </p>
      )}
    </aside>
  );
}
