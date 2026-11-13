import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function generateSpyLinks(teamNumber: number, teamName: string) {
    return {
        youtube: `https://www.youtube.com/results?search_query=FTC+${teamNumber}+${encodeURIComponent(teamName)}`,
        theOrangeAlliance: `https://theorangealliance.org/teams/${teamNumber}`,
        instagram: `https://www.instagram.com/explore/tags/ftc${teamNumber}/`
    };
}
