const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

export interface TBATeam {
    key: string;
    team_number: number;
    nickname: string;
    name: string;
    rookie_year: number;
}

export interface TBAEvent {
    key: string;
    name: string;
    event_code: string;
    event_type: number;
    start_date: string;
    end_date: string;
    year: number;
}

export interface TBARanking {
    rank: number;
    team_key: string;
    record: {
        losses: number;
        ties: number;
        wins: number;
    };
    qual_average: number | null;
    sort_orders: number[];
}

export interface TBAOPRs {
    oprs: Record<string, number>;
    bprs: Record<string, number>;
    ccwms: Record<string, number>;
}

export interface TBAMatch {
    key: string;
    comp_level: "qm" | "ef" | "qf" | "sf" | "f";
    set_number: number;
    match_number: number;
    alliances: {
        blue: {
            score: number;
            team_keys: string[];
        };
        red: {
            score: number;
            team_keys: string[];
        };
    };
    winning_alliance: "red" | "blue" | "";
    // TBA's per-game score breakdown JSON — shape varies by season/game and is
    // not consumed elsewhere in this codebase, so there is no concrete type to
    // narrow it to.
    score_breakdown: Record<string, unknown>;
    actual_time: number;
}

const getHeaders = () => {
    const apiKey = process.env.TBA_API_KEY;
    if (!apiKey) {
        throw new Error("TBA_API_KEY is not defined in environment variables");
    }
    return {
        "X-TBA-Auth-Key": apiKey,
        "Accept": "application/json"
    };
};

export async function getFRCEvents(year: number): Promise<TBAEvent[]> {
    const res = await fetch(`${TBA_BASE_URL}/events/${year}`, {
        headers: getHeaders(),
        next: { revalidate: 3600 }
    });
    if (!res.ok) throw new Error(`Failed to fetch TBA events: ${res.statusText}`);
    return res.json();
}

export async function getFRCEventTeams(eventKey: string): Promise<TBATeam[]> {
    const res = await fetch(`${TBA_BASE_URL}/event/${eventKey}/teams`, {
        headers: getHeaders(),
        next: { revalidate: 3600 }
    });
    if (!res.ok) throw new Error(`Failed to fetch TBA teams: ${res.statusText}`);
    return res.json();
}

export async function getFRCEventRankings(eventKey: string): Promise<{ rankings: TBARanking[] }> {
    const res = await fetch(`${TBA_BASE_URL}/event/${eventKey}/rankings`, {
        headers: getHeaders(),
        next: { revalidate: 300 }
    });
    if (!res.ok) throw new Error(`Failed to fetch TBA rankings: ${res.statusText}`);
    return res.json();
}

export async function getFRCEventOPRs(eventKey: string): Promise<TBAOPRs> {
    const res = await fetch(`${TBA_BASE_URL}/event/${eventKey}/oprs`, {
        headers: getHeaders(),
        next: { revalidate: 300 }
    });
    if (!res.ok) throw new Error(`Failed to fetch TBA OPRs: ${res.statusText}`);
    return res.json();
}

export async function getFRCEventMatches(eventKey: string): Promise<TBAMatch[]> {
    const res = await fetch(`${TBA_BASE_URL}/event/${eventKey}/matches`, {
        headers: getHeaders(),
        next: { revalidate: 60 }
    });
    if (!res.ok) throw new Error(`Failed to fetch TBA matches: ${res.statusText}`);
    return res.json();
}
