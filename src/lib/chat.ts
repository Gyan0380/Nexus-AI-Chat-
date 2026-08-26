import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";

import { getDb } from "./firebase";

export type ChatDoc = { id: string; uid: string; title: string };
export type MessageDoc = {
  id: string;
  role: "user" | "assistant";
  content: string;
  ts: number;
};

/** A user may own at most ONE chat at a time. */
export async function fetchActiveChat(uid: string): Promise<ChatDoc | null> {
  const snap = await getDocs(
    query(collection(getDb(), "Chats"), where("uid", "==", uid), limit(1)),
  );
  const first = snap.docs[0];
  if (!first) return null;
  const data = first.data();
  return { id: first.id, uid, title: (data['title'] as string) ?? "New chat" };
}

export function subscribeActiveChat(uid: string, cb: (chat: ChatDoc | null) => void) {
  return onSnapshot(
    query(collection(getDb(), "Chats"), where("uid", "==", uid), limit(1)),
    (snap) => {
      const first = snap.docs[0];
      cb(
        first
          ? { id: first.id, uid, title: (first.data()['title'] as string) ?? "New chat" }
          : null,
      );
    },
  );
}

export async function createChat(uid: string): Promise<ChatDoc> {
  const existing = await fetchActiveChat(uid);
  if (existing) {
    throw new Error("Delete your current chat first — only one active chat is allowed.");
  }
  const ref = await addDoc(collection(getDb(), "Chats"), {
    uid,
    title: "New chat",
    createdAt: serverTimestamp(),
  });
  return { id: ref.id, uid, title: "New chat" };
}

export async function deleteChat(chatId: string) {
  const messages = await getDocs(collection(getDb(), "Chats", chatId, "messages"));
  await Promise.all(messages.docs.map((m) => deleteDoc(m.ref)));
  await deleteDoc(doc(getDb(), "Chats", chatId));
}

export function subscribeMessages(chatId: string, cb: (messages: MessageDoc[]) => void) {
  return onSnapshot(
    query(collection(getDb(), "Chats", chatId, "messages"), orderBy("ts", "asc")),
    (snap) => {
      cb(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            role: data['role'] === "assistant" ? "assistant" : "user",
            content: (data['content'] as string) ?? "",
            ts: (data['ts'] as number) ?? 0,
          };
        }),
      );
    },
  );
}
