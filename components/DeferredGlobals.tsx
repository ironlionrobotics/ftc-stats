"use client";

import dynamic from "next/dynamic";

/**
 * Globally-mounted widgets that are deferred off the first-paint critical path.
 *
 * Both reach the Firebase client SDK (OnboardingModal through lib/orgs,
 * OnlineSync through lib/scouting-service), and `lib/firebase` initializes
 * app + auth + firestore + analytics at module scope. Imported statically from
 * the root layout, that put ~380 KB of Firebase into the chunk every page
 * downloads — including the fully public ones (/, /event, /analytics, /team)
 * where nobody is signed in and none of it is ever called.
 *
 * Neither renders anything at first paint anyway: OnboardingModal only opens
 * for a signed-in user who has no org, and OnlineSync only surfaces a badge
 * once there is pending offline data. So deferring costs no visible behavior
 * and moves the SDK into a chunk fetched after hydration.
 *
 * This wrapper exists because `ssr: false` is only allowed inside a Client
 * Component, and the root layout is a Server Component.
 */
const OnboardingModal = dynamic(() => import("@/components/auth/OnboardingModal"), { ssr: false });
const OnlineSync = dynamic(() => import("@/components/OnlineSync"), { ssr: false });
// AssistantChat reaches Firestore through lib/scouting-service and is a
// collapsed chat bubble until clicked — nothing about it belongs on the
// critical path either.
const AssistantChat = dynamic(() => import("@/components/ai/AssistantChat"), { ssr: false });

export default function DeferredGlobals({ aiAssistant }: { aiAssistant: boolean }) {
    return (
        <>
            {aiAssistant && <AssistantChat />}
            <OnboardingModal />
            <OnlineSync />
        </>
    );
}
