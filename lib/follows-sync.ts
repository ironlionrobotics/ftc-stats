"use client";

import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Follows } from "@/lib/follows";

/** Mirrors the device's follows into users/{uid}.follows (own doc, unprotected field). Best effort. */
export async function mirrorFollows(uid: string, follows: Follows): Promise<void> {
    await updateDoc(doc(db, "users", uid), { follows }).catch(e => console.warn("[follows] mirror failed:", e));
}
