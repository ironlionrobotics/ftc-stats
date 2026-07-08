// Empty replacement for the `server-only` package when running under Vitest.
// In a Next.js build the real package's side effect throws if imported from a
// client module; in tests we just want it to be a no-op so server modules can
// be loaded for unit testing of pure functions.
export { };
