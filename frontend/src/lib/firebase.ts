// Firebase Configuration
// ======================
// This file initializes Firebase services for the frontend.
// Note: These are client-side credentials (safe to expose in frontend code).
// They are restricted by Firebase Security Rules.

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBKiacyhwje4mqx1QHRHlsN7lFa4Kj_rIk",
  authDomain: "ai-oral-exam.firebaseapp.com",
  projectId: "ai-oral-exam",
  storageBucket: "ai-oral-exam.firebasestorage.app",
  messagingSenderId: "594877543703",
  appId: "1:594877543703:web:eb8ed6a880331f62553352"
};

// Initialize Firebase (prevent re-initialization in dev with hot reload)
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
