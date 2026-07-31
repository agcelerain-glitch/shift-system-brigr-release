// Firebase 初期化: .env の VITE_FIREBASE_* が未設定ならモックモードで動く

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

// 最低限 apiKey + projectId が揃っていれば本番とみなす
export const isFirebaseConfigured = Boolean(cfg.apiKey && cfg.projectId);

export const USER_EMAIL = import.meta.env.VITE_USER_EMAIL as string | undefined;
export const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;
// 末尾スラッシュを除去: /line/xxx と組み合わせたとき //line/xxx になるのを防ぐ
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '');

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(cfg as Record<string, string>);
  auth = getAuth(app);
  db = getFirestore(app);
}

export { app, auth, db };
