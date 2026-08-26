import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { getDb, getFirebaseAuth, googleProvider, isFirebaseConfigured } from "./firebase";

export type UserProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  plan: "free" | "premium";
  tokens: number;
  last_free_reset: string | null;
  premium_expires_at: string | null;
};

type AuthContextValue = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  configured: boolean;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string) => Promise<void>;
  signInGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function istDateString(date = new Date()) {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Creates the Users/{uid} document on first sign-in. */
async function ensureUserDoc(user: User) {
  const ref = doc(getDb(), "Users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    email: user.email,
    displayName: user.displayName ?? null,
    isAdmin: false,
    plan: "free",
    tokens: 10,
    last_free_reset: istDateString(),
    premium_expires_at: null,
    createdAt: serverTimestamp(),
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(getFirebaseAuth(), async (nextUser) => {
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setLoading(false);
      }
    });
  }, []);

  // Live subscription to the user's Firestore document (tokens, plan, isAdmin).
  useEffect(() => {
    if (!isFirebaseConfigured || !user) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      await ensureUserDoc(user);
      if (cancelled) return;
      unsub = onSnapshot(doc(getDb(), "Users", user.uid), (snap) => {
        const data = snap.data() ?? {};
        setProfile({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          isAdmin: data['isAdmin'] === true,
          plan: data['plan'] === "premium" ? "premium" : "free",
          tokens: typeof data['tokens'] === "number" ? data['tokens'] : 0,
          last_free_reset: (data['last_free_reset'] as string) ?? null,
          premium_expires_at: (data['premium_expires_at'] as string) ?? null,
        });
        setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user]);

  const signInEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);

  const signUpEmail = useCallback(async (email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    await ensureUserDoc(cred.user);
  }, []);

  const signInGoogle = useCallback(async () => {
    const cred = await signInWithPopup(getFirebaseAuth(), googleProvider);
    await ensureUserDoc(cred.user);
  }, []);

  const logout = useCallback(async () => {
    await signOut(getFirebaseAuth());
  }, []);

  const getIdToken = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    if (!current) throw new Error("Not signed in");
    return current.getIdToken();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      isAdmin: profile?.isAdmin === true,
      configured: isFirebaseConfigured,
      signInEmail,
      signUpEmail,
      signInGoogle,
      logout,
      getIdToken,
    }),
    [user, profile, loading, signInEmail, signUpEmail, signInGoogle, logout, getIdToken],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
