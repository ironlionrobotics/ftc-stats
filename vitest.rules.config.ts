import { defineConfig } from "vitest/config";

// Firestore security-rules tests. Need the emulator, so they are NOT part of
// `npm test`; run with `npm run test:rules` (wraps firebase emulators:exec).
export default defineConfig({
    test: {
        include: ["test/firestore-rules/**/*.test.ts"],
        environment: "node",
        testTimeout: 20000,
        fileParallelism: false,
    },
});
