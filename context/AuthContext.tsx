"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
// TYPE-ONLY import: erased at build time, so it does not pull the Firebase Auth
// SDK into this module's chunk. Every value import of firebase below is dynamic
// — see the LAZY LOADING note on AuthProvider.
import type { User } from "firebase/auth";
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

/**
 * LAZY LOADING. This provider sits in the root layout, so anything it imports
 * statically lands in the chunk every page downloads — including the fully
 * public ones (/, /event, /analytics, /team) where nobody is signed in. The
 * Firebase client SDK (app + auth + firestore + analytics) is ~380 KB of that,
 * and `lib/firebase` initializes all of it at module scope, so a single static
 * import was enough to put the whole thing on the critical path of a page that
 * never calls it.
 *
 * So every Firebase value import here is dynamic:
 *   - the auth subscription is established in an effect, after hydration;
 *   - sign-in and logout import on click, which is the ideal moment;
 *   - the user-doc loader (lib/orgs, which pulls Firestore) imports only once
 *     there is actually a user.
 *
 * The public shape of `useAuth()` is unchanged, so consumers need no edits.
 * `user` starts `undefined` and `loading` starts `true` exactly as the previous
 * `useAuthState` implementation did — consumers that branch on those keep
 * working, they just resolve a moment later on the first visit.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null | undefined>(undefined);
    const [loading, setLoading] = useState(true);
    const [userDoc, setUserDoc] = useState<AppUser | null>(null);
    const [userDocLoading, setUserDocLoading] = useState(false);

    // Subscribe to auth state once, after mount.
    useEffect(() => {
        let cancelled = false;
        let unsubscribe: (() => void) | undefined;

        (async () => {
            try {
                const [{ auth }, { onAuthStateChanged }] = await Promise.all([
                    import("@/lib/firebase"),
                    import("firebase/auth"),
                ]);
                if (cancelled) return;
                unsubscribe = onAuthStateChanged(
                    auth,
                    u => { setUser(u); setLoading(false); },
                    e => { console.error("[auth] subscription error", e); setUser(null); setLoading(false); },
                );
            } catch (e) {
                // Firebase failed to load (offline on first visit, or missing
                // config). Resolve to signed-out rather than leaving every
                // consumer stuck on `loading` forever — the app's public
                // surface works fine without auth.
                console.error("[auth] failed to initialize Firebase Auth", e);
                if (!cancelled) { setUser(null); setLoading(false); }
            }
        })();

        return () => { cancelled = true; unsubscribe?.(); };
    }, []);

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
                const { loadOrCreateUserDoc } = await import("@/lib/orgs");
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
        const { refreshUserDoc } = await import("@/lib/orgs");
        const fresh = await refreshUserDoc(user.uid);
        setUserDoc(fresh);
    }, [user]);

    const signInWithGoogle = useCallback(async () => {
        try {
            const [{ auth }, { GoogleAuthProvider, signInWithPopup }] = await Promise.all([
                import("@/lib/firebase"),
                import("firebase/auth"),
            ]);
            await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (e) {
            console.error("Error signing in with Google", e);
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            const [{ auth }, { signOut }] = await Promise.all([
                import("@/lib/firebase"),
                import("firebase/auth"),
            ]);
            await signOut(auth);
        } catch (e) {
            console.error("Error signing out", e);
        }
    }, []);

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
