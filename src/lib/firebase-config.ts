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
  apiKey: "AIzaSyCDLlqMtCGcKfbchKblBNNLec9Y4AkRXL0",
  authDomain: "student-a866d.firebaseapp.com",
  projectId: "student-a866d",
  storageBucket: "student-a866d.firebasestorage.app",
  messagingSenderId: "742359477068",
  appId: "1:742359477068:web:71936b5ab228222da9fde9",
};

export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith("REPLACE_WITH");
