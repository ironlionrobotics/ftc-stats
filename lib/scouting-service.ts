import { db } from "./firebase";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot,
    Timestamp,
    addDoc
} from "firebase/firestore";
import { PitScouting, MatchScouting } from "@/types/ftc";

const PIT_COLLECTION = "pit_scouting";
const MATCH_COLLECTION = "match_scouting";

// Pit Scouting - One document per team per season
export async function savePitScouting(data: PitScouting) {
    const docId = `${data.season}_${data.teamNumber}`;
    const docRef = doc(db, PIT_COLLECTION, docId);
    await setDoc(docRef, {
        ...data,
        lastUpdatedAt: Timestamp.now()
    }, { merge: true });
}

export async function getPitScouting(season: number, teamNumber: number): Promise<PitScouting | null> {
    const docId = `${season}_${teamNumber}`;
    const docRef = doc(db, PIT_COLLECTION, docId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return docSnap.data() as PitScouting;
    }
    return null;
}

// Match Scouting - Multiple entries per match
export async function saveMatchScouting(data: MatchScouting) {
    const colRef = collection(db, MATCH_COLLECTION);
    await addDoc(colRef, {
        ...data,
        timestamp: Timestamp.now()
    });
}

export function listenToMatchScouting(season: number, eventCode: string, callback: (data: MatchScouting[]) => void) {
    const colRef = collection(db, MATCH_COLLECTION);
    const q = query(
        colRef,
        where("season", "==", season),
        where("eventCode", "==", eventCode),
        orderBy("timestamp", "desc")
    );

    return onSnapshot(q, (snapshot) => {
        const matches: MatchScouting[] = [];
        snapshot.forEach((doc) => {
            matches.push({ id: doc.id, ...doc.data() } as MatchScouting);
        });
        callback(matches);
    });
}

export async function getMatchScoutingForTeam(season: number, teamNumber: number): Promise<MatchScouting[]> {
    const colRef = collection(db, MATCH_COLLECTION);
    const q = query(
        colRef,
        where("season", "==", season),
        where("teamNumber", "==", teamNumber),
        orderBy("timestamp", "desc")
    );
    const querySnapshot = await getDocs(q);
    const results: MatchScouting[] = [];
    querySnapshot.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() } as MatchScouting);
    });
    return results;
}
