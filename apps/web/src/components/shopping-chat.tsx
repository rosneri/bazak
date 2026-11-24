"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { FormEvent } from "react";
import { ThemeSwitch } from "@bazak/ui/components/theme-switch";
import { Button } from "@bazak/ui/components/button";
import { useShoppingSession } from "../client/chat-session";
import { ConversationPane, useTranscriptScroll } from "./conversation-pane";
import { SavedChats } from "./saved-chats";
import { ChatComposer } from "./chat-composer";

interface HomeRoute {
  pathname: string;
  session: number;
  createdPath: string | null;
}

export function ShoppingChat({ initialId }: { initialId: string | null }) {
  return initialId === null ? <HomeShoppingChat /> : <ShoppingDesk initialId={initialId} />;
}

function HomeShoppingChat() {
  const pathname = usePathname();
  const [route, setRoute] = useState<HomeRoute>({ pathname, session: 0, createdPath: null });

  // The home route can stay mounted when Next restores its history entry.
  if (pathname !== route.pathname)
    setRoute({
      pathname,
      session: pathname === route.createdPath ? route.session : route.session + 1,
      createdPath: null,
    });

  function openCreatedConversation(id: string) {
    const createdPath = "/conversations/" + id;
    setRoute((current) => ({ ...current, createdPath }));
    window.history.replaceState(null, "", createdPath);
  }

  const id = pathname.match(/^\/conversations\/([^/]+)$/)?.[1] ?? null;

  return <ShoppingDesk key={route.session} initialId={id} onCreate={openCreatedConversation} />;
}

function ShoppingHeader({ menu, toggleMenu }: { menu: boolean; toggleMenu: () => void }) {
  return (
    <header className="masthead">
      <Link className="brand" href="/" aria-label="Bazak home">
        <span className="brand-mark" aria-hidden="true">
          b
        </span>
        Bazak
      </Link>
      <span className="mast-divider" />
      <span className="mast-title">Shopping desk</span>
      <ThemeSwitch />
      <Button
        variant="outline"
        className="history-toggle"
        aria-controls="chat-history"
        aria-expanded={menu}
        onClick={toggleMenu}
      >
        {menu ? "Close history" : "History"}
      </Button>
    </header>
  );
}

function ShoppingDesk({
  initialId,
  onCreate,
}: {
  initialId: string | null;
  onCreate?: (id: string) => void;
}) {
  const session = useShoppingSession(initialId, onCreate);
  const [menu, setMenu] = useState(false);
  const { transcript, trackScroll, followNextReply } = useTranscriptScroll();
  const composer = useRef<HTMLTextAreaElement>(null);

  function selectExample(text: string) {
    session.setDraft(text);
    composer.current?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    followNextReply();
    void session.send();
  }

  return (
    <div className="shop-shell">
      <ShoppingHeader menu={menu} toggleMenu={() => setMenu(!menu)} />
      <SavedChats menu={menu} session={session} />
      <main className="workspace">
        <ConversationPane
          session={session}
          selectExample={selectExample}
          transcript={transcript}
          trackScroll={trackScroll}
        />
        {!session.inaccessible && (
          <ChatComposer session={session} composer={composer} onSubmit={submit} />
        )}
      </main>
    </div>
  );
}
