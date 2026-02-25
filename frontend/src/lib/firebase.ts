/**
 * Firebase Configuration
 * ======================
 * Firebase client SDK initialization and exports.
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  User as FirebaseUser,
  updateProfile,
} from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Firebase configuration - uses environment variables with fallbacks
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyBKiacyhwje4mqx1QHRHlsN7lFa4Kj_rIk",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "ai-oral-exam.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "ai-oral-exam",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "ai-oral-exam.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "594877543703",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:594877543703:web:eb8ed6a880331f62553352"
};

// Initialize Firebase (prevent multiple initializations)
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

auth = getAuth(app);
db = getFirestore(app);
storage = getStorage(app);

// Google Auth Provider
const googleProvider = new GoogleAuthProvider();

// Auth functions
export const signInWithEmail = async (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const signUpWithEmail = async (
  email: string, 
  password: string, 
  displayName: string
) => {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(result.user, { displayName });
  await sendEmailVerification(result.user);
  return result;
};

export const resendVerificationEmail = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  if (user.emailVerified) throw new Error('Email already verified');
  await sendEmailVerification(user);
};

export const signInWithGoogle = async () => {
  return signInWithPopup(auth, googleProvider);
};

export const logout = async () => {
  return signOut(auth);
};

export const getIdToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken();
};

// Auth state observer
export const onAuthChange = (callback: (user: FirebaseUser | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

// Export instances
export { app, auth, db, storage };
export type { FirebaseUser };
