import { TeamRanking, AdvancementResponse, AdvancementPoints } from "@/types/ftc";

const BASE_URL = "https://ftc-api.firstinspires.org/v2.0";
const SEASON = 2025;

// Credentials should ideally be in environment variables
const USERNAME = "roborob30311";
const API_KEY = "7C22AFCB-BF55-4A61-9C3D-1748ABF0AB8A";

const AUTH_HEADER = {
    Authorization: `Basic ${Buffer.from(`${USERNAME}:${API_KEY}`).toString('base64')}`,
};

export async function fetchRankings(eventCode: string): Promise<TeamRanking[]> {
    try {
        const response = await fetch(`${BASE_URL}/${SEASON}/rankings/${eventCode}`, {
            headers: AUTH_HEADER,
            next: { revalidate: 3600 }, // Cache for 1 hour
        });

        if (!response.ok) {
            console.error(`Status: ${response.status} ${response.statusText} for ${eventCode}`);
            // If 404, it might mean the event hasn't happened or data is missing, treat as empty.
            if (response.status === 404) return [];
            return [];
        }

        const data = await response.json();
        return data.rankings || [];
    } catch (error) {
        console.error(`Error fetching rankings for ${eventCode}:`, error);
        return [];
    }
}

export async function fetchAdvancement(eventCode: string): Promise<AdvancementResponse | null> {
    try {
        const response = await fetch(`${BASE_URL}/${SEASON}/advancement/${eventCode}`, {
            headers: AUTH_HEADER,
            next: { revalidate: 3600 },
        });

        if (!response.ok) {
            console.error(`Failed to fetch advancement for ${eventCode}`);
            return null;
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error(`Error fetching advancement for ${eventCode}:`, error);
        return null;
    }
}

export async function fetchAdvancementPoints(eventCode: string): Promise<AdvancementPoints[]> {
    try {
        const response = await fetch(`${BASE_URL}/${SEASON}/advancement/${eventCode}/points`, {
            headers: AUTH_HEADER,
            next: { revalidate: 3600 },
        });

        if (!response.ok) {
            console.error(`Failed to fetch advancement points for ${eventCode}`);
            return [];
        }

        const data = await response.json();
        return data || [];
    } catch (error) {
        console.error(`Error fetching advancement points for ${eventCode}:`, error);
        return [];
    }
}
