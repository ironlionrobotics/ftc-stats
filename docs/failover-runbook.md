# Failover Runbook — Premier Event Day

Game-day plan for when something breaks. Read **before** the event, print a copy, share with everyone in the scouting team.

---

## Quick decision tree

```
SOMETHING IS BROKEN
        │
        ├─ Can scouts capture data? ──┐
        │                              ├─ NO → "Total outage" (see §1)
        │                              └─ YES → continue
        │
        ├─ Can data sync to cloud? ───┐
        │                              ├─ NO → "Offline mode" (see §2)
        │                              └─ YES → continue
        │
        └─ Is the strategy lead's view correct? ─ NO → "Data integrity" (see §3)
```

---

## §1 Total outage (no scouts can capture data)

**Symptoms:** App won't load. White screen. Auth fails for everyone.

**Recovery (in priority order):**

1. **Switch network**: have one scout connect to phone hotspot. If app loads on hotspot but not venue Wi-Fi, the venue's DNS or proxy is blocking us. **Workaround**: every scout uses hotspots.
2. **Try the cached PWA**: if the app was installed as PWA (`Add to Home Screen` on iOS/Android), Serwist's service worker should serve the cached shell offline. Open from home screen icon, not browser tab.
3. **Manual fallback**: distribute paper scouting sheets (kept in pit cart as backup — see §1.1 below). Capture manually, type into the app post-match.

### §1.1 Paper backup contents

A printed pack should be in the pit cart on game day. Each sheet has:
- Match # field
- Team # field
- Per-phase counters (auto purple/green, teleop purple/green, patterns, parking)
- Driver skill 1-5
- Notes
- Scout name

After internet returns, scouts type into the app at their convenience.

---

## §2 Offline mode (scouts capture but no cloud sync)

**Symptoms:** App works, scouts can save match scouting, but the "Online" pill in bottom-right shows "Offline" or "N pendientes" and never clears.

**This is the designed behavior.** Sprint 1.8's Dexie schema buffers every entry locally. Sprint 1.11's `OnlineSync` drains the queue when connectivity returns.

**What to do:**

1. **Keep scouting**. The app handles this. Don't stop and don't repeat entries.
2. **Verify Dexie is filling up**: open DevTools → Application → IndexedDB → `FTCStatsLocal` → `pendingMatches`. Should grow as scouts capture.
3. **When connectivity returns**: the pill auto-drains. You can tap it to force-sync immediately.
4. **If sync fails repeatedly**: pill shows ⚠ ámbar. Check error in DevTools console. Most likely Firestore rules issue — see §3.3.

### §2.1 QR fallback (no internet AND scouts on separate devices)

If venue has zero internet for hours and you need to consolidate scouting from multiple tablets:

1. Each tablet opens its own pending list (Dexie has the data)
2. Use the QR export/import flow (already in `MatchScoutingForm` for FRC; for FTC implement before event if needed)
3. One device acts as "consolidator", scans all the others' QRs

---

## §3 Data integrity (strategy lead sees wrong numbers)

### §3.1 Predictions show 0 / null / NaN

**Cause:** Most likely an event with no rankings loaded yet (event hasn't started), or the FTC API returned empty data.

**Verify:**
1. Open `/strategy` → Live Ranking tab → pick the event. If "Sin matches jugados" appears, the event genuinely has no data yet.
2. Otherwise check DevTools Network for failing requests to `ftc-api.firstinspires.org`.

**Fix:**
- If FTC API is down: nothing to do. Wait. Match data refreshes every 60s during active events.
- If Upstash cache is down: app falls back to direct fetch (slower). Verify env var `UPSTASH_REDIS_REST_URL` is set.

### §3.2 Wrong team appears in alliance / picklist

**Cause:** Team number typo somewhere upstream OR stale cache.

**Fix:**
1. Hard-reload the page (Ctrl+Shift+R / Cmd+Shift+R)
2. If wrong data persists, the issue is in Firestore. Check `picklists/{orgId}_{eventCode}` doc directly in Firebase console.

### §3.3 Scout reports "permission denied" when saving

**Cause:** Firestore rules rejected the write. Almost always: user not logged in, user's `orgId` doesn't match the entry, OR rules haven't been deployed (matches the local `firestore.rules` file).

**Fix:**
1. **Verify rules are deployed**: Firebase Console → Firestore → Rules. Compare to local `firestore.rules`. If they differ, deploy: `firebase deploy --only firestore:rules`.
2. Verify scout completed onboarding (sidebar shows "Equipo #N" under their email)
3. Have them logout + login again.

### §3.4 Brier score = N/A or no predictions logged

**Cause:** `FIREBASE_SERVICE_ACCOUNT_KEY` env var not set in production.

**Fix:** Without this, `logPredictionAction` silently fails (by design — calibration must never block UI). Set the env var in Firebase App Hosting and redeploy. Backfill not needed; predictions logged going forward.

---

## §4 Emergency contacts

| Issue | Who to ping |
|---|---|
| FTC-events API down | Wait. No fix possible. |
| Firestore down | Firebase Status page (status.firebase.google.com) — usually <30min |
| Upstash down | Cache degrades to nothing; app still works but slow |
| App code bug discovered mid-event | Hotfix branch `hotfix/premier`, deploy via Firebase App Hosting |

---

## §5 Pre-event checklist (24h before)

- [ ] Visit `/` on dev account, confirm no errors
- [ ] Visit `/scouting`, capture a test entry, confirm it saves
- [ ] Visit `/strategy` → all 5 tabs render without errors
- [ ] Visit `/analytics` → Calibration tab loads (should show metrics if firebase-admin is set)
- [ ] Run `npm run build` locally; should pass
- [ ] Verify Firestore rules in Firebase Console match local file
- [ ] Verify Upstash dashboard shows cache reads (otherwise cache is disabled)
- [ ] Verify Sentry dashboard shows the app is reporting (production-only)
- [ ] Print this runbook + paper backup sheets
- [ ] Have at least 1 phone hotspot available per 2 scouts as Wi-Fi backup
- [ ] PWA installed on every scout device (`Add to Home Screen`)
- [ ] Charged tablets + spare power banks

---

## §6 Post-incident notes

After any disruption, capture:
- What broke (symptoms)
- Root cause (if known)
- What we did
- What worked / didn't
- What we'd do differently

Add the notes to `docs/memory/decisions.md` for the next event team to learn from.
