import { describe, it, expect } from "vitest";
import { nextLoanStatus, isOpenLoan, matchesQuery, itemsAtEvent, cleanText, type InventoryItem, type EventPresence } from "./lending";

describe("pit lending (#104)", () => {
    it("borrower marks, lender confirms; lender can close directly", () => {
        expect(nextLoanStatus("lent", "borrower")).toBe("return_marked");
        expect(nextLoanStatus("return_marked", "lender")).toBe("returned");
        expect(nextLoanStatus("lent", "lender")).toBe("returned");
        expect(nextLoanStatus("return_marked", "borrower")).toBeNull();
        expect(nextLoanStatus("returned", "lender")).toBeNull();
        expect(nextLoanStatus("given", "borrower")).toBeNull();
    });

    it("open loans are lent or marked", () => {
        expect(isOpenLoan({ status: "lent" })).toBe(true);
        expect(isOpenLoan({ status: "return_marked" })).toBe(true);
        expect(isOpenLoan({ status: "returned" })).toBe(false);
        expect(isOpenLoan({ status: "given" })).toBe(false);
    });

    it("search ignores case and accents, all words must match", () => {
        expect(matchesQuery("Llave Allen 3/32", "allen")).toBe(true);
        expect(matchesQuery("Batería REV", "bateria")).toBe(true);
        expect(matchesQuery("Servo goBILDA", "servo rev")).toBe(false);
        expect(matchesQuery("anything", "  ")).toBe(true);
    });

    it("only lendable, in-stock items of teams at the event, not mine", () => {
        const items: InventoryItem[] = [
            { orgId: "1", teamNumber: 1, name: "Servo", category: "part", qty: 2, lendable: true, giveaway: false },
            { orgId: "1", teamNumber: 1, name: "Servo spare", category: "part", qty: 0, lendable: true, giveaway: false },
            { orgId: "2", teamNumber: 2, name: "Servo", category: "part", qty: 1, lendable: false, giveaway: false },
            { orgId: "3", teamNumber: 3, name: "Servo", category: "part", qty: 1, lendable: true, giveaway: false },
            { orgId: "9", teamNumber: 9, name: "Servo", category: "part", qty: 1, lendable: true, giveaway: false },
        ];
        const present: EventPresence[] = [
            { season: 2026, eventCode: "MXTLQ", orgId: "1", teamNumber: 1, teamName: "A", pit: "4" },
            { season: 2026, eventCode: "MXTLQ", orgId: "2", teamNumber: 2, teamName: "B", pit: "5" },
            { season: 2026, eventCode: "MXTLQ", orgId: "9", teamNumber: 9, teamName: "Me", pit: "6" },
        ];
        expect(itemsAtEvent(items, present, "servo", "9").map(r => r.item.orgId)).toEqual(["1"]);
    });

    it("cleans text", () => {
        expect(cleanText("  a   b ", 10)).toBe("a b");
        expect(cleanText(42, 10)).toBe("");
        expect(cleanText("x".repeat(20), 5)).toBe("xxxxx");
    });
});
