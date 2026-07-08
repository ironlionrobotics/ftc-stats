"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { User, GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "@/lib/firebase";
import { loadOrCreateUserDoc, refreshUserDoc } from "@/lib/orgs";
import type { AppUser } from "@/types/orgs";

interface AuthContextType {
    user: User | null | undefined;
    /** Firestore user document — null until loaded; `orgId === null` means user has not completed onboarding. */
    userDoc: AppUser | null;
    /** Convenience: userDoc.orgId. null = not onboarded. */
    orgId: string | null;
    /** Firebase Auth loading flag. */
    loading: boolean;
    /** True while the user doc is being loaded after auth. */
    userDocLoading: boolean;
    signInWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    /** Force-reload the user doc, e.g. after onboarding completes. */
    reloadUserDoc: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    userDoc: null,
    orgId: null,
    loading: true,
    userDocLoading: false,
    signInWithGoogle: async () => { },
    logout: async () => { },
    reloadUserDoc: async () => { },
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, loading] = useAuthState(auth);
    const [userDoc, setUserDoc] = useState<AppUser | null>(null);
    const [userDocLoading, setUserDocLoading] = useState(false);

    // Load/create the Firestore user doc on every auth state change. The first
    // login creates the doc with orgId=null so onboarding can kick in.
    useEffect(() => {
        let cancelled = false;
        async function run() {
            if (!user) {
                setUserDoc(null);
                return;
            }
            setUserDocLoading(true);
            try {
                const doc = await loadOrCreateUserDoc(user);
                if (!cancelled) setUserDoc(doc);
            } catch (e) {
                console.error("[auth] failed to load user doc", e);
                if (!cancelled) setUserDoc(null);
            } finally {
                if (!cancelled) setUserDocLoading(false);
            }
        }
        run();
        return () => { cancelled = true; };
    }, [user]);

    const reloadUserDoc = useCallback(async () => {
        if (!user) return;
        const fresh = await refreshUserDoc(user.uid);
        setUserDoc(fresh);
    }, [user]);

    const signInWithGoogle = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (e) {
            console.error("Error signing in with Google", e);
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (e) {
            console.error("Error signing out", e);
        }
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                userDoc,
                orgId: userDoc?.orgId ?? null,
                loading,
                userDocLoading,
                signInWithGoogle,
                logout,
                reloadUserDoc,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
