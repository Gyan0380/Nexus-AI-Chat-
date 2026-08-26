/**
 * Firebase WEB config (publishable — safe to ship in client code).
 *
 * >>> PASTE YOUR VALUES HERE <<<
 * Firebase console -> Project settings -> Your apps -> SDK setup and configuration.
 *
 * These are NOT secrets. The private Firebase Admin service account and all AI
 * provider keys live in server-side environment variables only.
 */
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID",
};

export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith("REPLACE_WITH");
