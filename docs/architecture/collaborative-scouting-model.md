# Modelo de Scouting Colaborativo

**Estado:** Aprobado — implementación en Sprint 1
**Última revisión:** 2026-05-24
**Owners:** FTC 30311

Este documento define cómo múltiples equipos comparten datos de scouting en la app para que cada equipo participante pueda obtener mejor cobertura del torneo que la que lograría con sus 2-3 scouts propios.

---

## 1. Premisa

Un equipo FTC típico mexicano tiene 2-3 personas disponibles para scoutar en un evento. Un torneo regional con 24+ equipos genera ~80 matches; un solo equipo de scouts no puede cubrir todas las observaciones que el strategy lead necesita para alliance selection.

**Solución:** federar los datos. Si 4 equipos del torneo cada uno aporta 2-3 scouts, juntos cubren 8-12 scouts × 80 matches = miles de observaciones que benefician a todos los participantes.

---

## 2. Entidades

### 2.1 `orgs/{orgId}` — Equipo / organización

Cuenta de un equipo participante. Cada cuenta tiene 1+ miembros (scouts).

```ts
type Org = {
    id: string;                  // teamNumber as string, e.g. "30311"
    teamNumber: number;
    displayName: string;         // "Iron Lions"
    program: "FTC" | "FRC";
    region: string;              // "MX-NL", "MX-CDMX", etc.
    createdAt: Timestamp;
    createdBy: UserId;           // Firebase Auth uid
};
```

### 2.2 `users/{userId}` — Scout / usuario individual

Identidad atada a Firebase Auth (Google login). Un user puede pertenecer a 1 org (en v1 — multi-org se posterga).

```ts
type User = {
    id: string;                  // Firebase Auth uid
    email: string;
    displayName: string;
    orgId: string | null;        // si null, usuario sin equipo (solo lectura pública)
    role: "scout" | "lead" | "admin";  // dentro de su org
    reliability: number;         // 0-1, calculado por ground-truth validation
    matchesScouted: number;      // contador derivado para UI
    createdAt: Timestamp;
};
```

### 2.3 `event_subscriptions/{orgId_eventCode}` — Equipo cubriendo un evento

Declaración explícita de que un equipo va a estar scouteando en un evento. Sirve para:
- Mostrar "estos equipos están aportando data en este evento"
- Coordinar cobertura (división de matches a scoutar)
- Privacidad (un equipo no ve scouting de equipos que no están subscritos al mismo evento)

```ts
type EventSubscription = {
    orgId: string;
    eventCode: string;
    season: number;
    subscribedAt: Timestamp;
    subscribedBy: UserId;
};
```

### 2.4 `match_scouting/{entryId}` — Observación de un match

**Una observación = un scout reportando lo que vio de UN equipo en UN match.** En el modelo federado, el mismo (match, team) puede tener N entries de distintos scouts.

```ts
type MatchScoutingEntry = {
    id: string;                  // auto-id

    // Identificación del match observado
    season: number;
    eventCode: string;
    matchNumber: number;
    tournamentLevel: "QUALIFICATION" | "PLAYOFF";
    teamNumber: number;          // equipo scouteado (no el del scout)
    alliance: "Red" | "Blue";

    // Attribution
    scoutId: string;             // Firebase Auth uid del scout
    orgId: string;               // org del scout (denormalizado para queries)
    timestamp: Timestamp;
    appVersion: string;          // para debug si bug específico de versión

    // Calidad de la observación (auto-evaluada por el scout)
    confidence: "high" | "medium" | "low";  // "no estaba seguro"

    // Game data — específico por temporada (ver schema versionado)
    gameSchemaVersion: number;   // e.g., 1 para DECODE 2025-2026
    auto: Record<string, any>;
    teleop: Record<string, any>;
    endgame: Record<string, any>;

    // Subjetivo opcional (super scouting)
    driverSkill?: 1 | 2 | 3 | 4 | 5;
    defenseRating?: 1 | 2 | 3 | 4 | 5;
    reliability?: 1 | 2 | 3 | 4 | 5;
    notes?: string;
};
```

### 2.5 `pit_scouting/{season}_{teamNumber}_{orgId}` — Pit info por equipo POR org

**Cada org tiene SU propia versión** del pit scouting del mismo equipo. Esto es intencional:
- Las preguntas/respuestas pueden divergir entre equipos
- Algunas observaciones son subjetivas/sesgadas
- Privacidad: notas estratégicas internas no se filtran

```ts
type PitScouting = {
    season: number;
    teamNumber: number;
    orgId: string;               // quién hizo este pit scouting

    drivetrain?: string;
    programmingLanguage?: string;
    weight?: number;
    autoCapabilities?: string;
    endgameCapabilities?: string;
    photos?: string[];           // Cloud Storage URLs
    notes?: string;              // subjetivo, NO se comparte entre orgs

    publicSummary?: string;      // sí se comparte: resumen objetivo opt-in
    publicSummarySharedAt?: Timestamp;

    scoutedBy: UserId;
    lastUpdatedAt: Timestamp;
};
```

### 2.6 `team_profiles/{season}_{teamNumber}` — Virtual Pit público (opt-in)

Lo que un equipo publica sobre sí mismo. Importable por scouts de otros equipos en vez de pedir las mismas preguntas en pits.

```ts
type TeamProfile = {
    season: number;
    teamNumber: number;
    publishedBy: UserId;         // debe ser miembro de orgId == teamNumber
    publishedAt: Timestamp;

    drivetrain?: string;
    autoCapabilities?: string[];
    endgameCapabilities?: string[];
    keyMechanisms?: string[];
    socialLinks?: { discord?: string; instagram?: string; web?: string };
    photo?: string;
};
```

### 2.7 `calibration_log/{entryId}` — Predicción vs realidad

Para tracking de Brier score y calibration metrics.

```ts
type CalibrationEntry = {
    id: string;
    season: number;
    eventCode: string;
    matchNumber: number;

    predictedAt: Timestamp;
    predictedWinProb: number;    // 0-1, prob de Red
    predictedRedScore: number;
    predictedBlueScore: number;

    actualOutcome?: "red" | "blue" | "tie";  // populado después de ftc-events sync
    actualRedScore?: number;
    actualBlueScore?: number;
    settledAt?: Timestamp;
};
```

---

## 3. Resolución de conflictos

Cuando 2+ scouts (de orgs distintas o de la misma org) reportan el mismo (match, team), **no se descarta**, **no se sobrescribe**, **no se promedia ciegamente**. Se agregan con reglas explícitas:

### 3.1 Para campos numéricos (autoPoints, teleopArtifacts, etc.)

```
consensus = weighted_mean(entries, weight = scout.reliability * confidence_score(entry))
variance  = weighted_var(entries)
```

donde `confidence_score(high) = 1.0`, `medium = 0.6`, `low = 0.3`.

Si `variance > THRESHOLD`, el dato se **flagea visualmente** en la UI ("scouts no concuerdan"). El strategy lead decide.

### 3.2 Para campos categóricos (endgameBaseParking)

Mayoría ponderada por reliability. Si empate, el más reciente gana y se flagea.

### 3.3 Para campos subjetivos (driverSkill, defenseRating)

**NO se mezclan entre orgs.** Razón: la escala 1-5 calibra distinto entre equipos (el "5" de un equipo conservador puede ser el "3" de otro agresivo). En la UI:
- "Tu equipo dice: 4"
- "Promedio entre otros equipos: 3.2"
- Mostrar ambos por separado, jamás combinados.

### 3.4 Para notas de texto

Listadas todas con atribución (org, scout, timestamp). Sin merge automático.

---

## 4. Privacidad y visibilidad

### 4.1 Match scouting

- **Público entre orgs subscritas al mismo evento:** todos los campos objetivos (counts, ratings de driver/defense/reliability con atribución).
- **Privado de la org:** campo `notes` libre.
- **No suscritos:** sin acceso a observaciones del evento.

### 4.2 Pit scouting

- **Privado siempre:** `notes` interno.
- **Público (opt-in):** `publicSummary` si el org lo activa.
- **Las photos** son privadas por default; opt-in para publicar.

### 4.3 Team profiles (Virtual Pit)

- **Solo el propio equipo edita** (Firebase Rules: `request.auth.orgId == teamNumber`).
- **Lectura pública** para cualquier scout autenticado.

### 4.4 Calibration log

- **Solo lectura del propio org**, para no exponer accuracy comparativa entre equipos.
- Agregados de Brier score sí se pueden mostrar públicamente.

---

## 5. Firestore Security Rules (esqueleto)

```firestore
rules_version = '2';
service cloud.firestore {
    match /databases/{db}/documents {

        function isAuthed() { return request.auth != null; }
        function myOrg() { return get(/databases/$(db)/documents/users/$(request.auth.uid)).data.orgId; }
        function isSubscribedTo(eventCode, season) {
            return exists(/databases/$(db)/documents/event_subscriptions/$(myOrg() + '_' + eventCode));
        }

        // Users: only the user reads/writes their own profile
        match /users/{uid} {
            allow read, write: if request.auth.uid == uid;
        }

        // Orgs: lead/admin of the org can write; anyone authed can read
        match /orgs/{orgId} {
            allow read: if isAuthed();
            allow write: if isAuthed() && myOrg() == orgId &&
                            get(/databases/$(db)/documents/users/$(request.auth.uid)).data.role in ['lead', 'admin'];
        }

        // Event subscriptions: managed by the subscribing org
        match /event_subscriptions/{subId} {
            allow read: if isAuthed();
            allow write: if isAuthed() && resource.data.orgId == myOrg();
        }

        // Match scouting
        match /match_scouting/{entryId} {
            allow read: if isAuthed() && (
                resource.data.orgId == myOrg() ||
                isSubscribedTo(resource.data.eventCode, resource.data.season)
            );
            allow create: if isAuthed() &&
                request.resource.data.scoutId == request.auth.uid &&
                request.resource.data.orgId == myOrg();
            // No updates after the fact. Re-scout = new entry.
            allow update, delete: if false;
        }

        // Pit scouting
        match /pit_scouting/{pitId} {
            allow read: if isAuthed() && resource.data.orgId == myOrg();
            allow write: if isAuthed() && request.resource.data.orgId == myOrg();
        }

        // Team profiles (Virtual Pit)
        match /team_profiles/{profileId} {
            allow read: if isAuthed();
            allow write: if isAuthed() &&
                myOrg() == string(request.resource.data.teamNumber);
        }

        // Calibration log: per-org
        match /calibration_log/{entryId} {
            allow read, write: if isAuthed() && resource.data.orgId == myOrg();
        }

        // api_cache: only server (admin SDK bypasses rules anyway)
        match /api_cache/{key} {
            allow read, write: if false;  // legacy collection; migrating to Upstash
        }
    }
}
```

---

## 6. Índices Firestore necesarios

```yaml
indexes:
  - collection: match_scouting
    fields:
      - season: asc
      - eventCode: asc
      - timestamp: desc
  - collection: match_scouting
    fields:
      - season: asc
      - eventCode: asc
      - teamNumber: asc
      - timestamp: desc
  - collection: match_scouting
    fields:
      - orgId: asc
      - timestamp: desc
  - collection: event_subscriptions
    fields:
      - eventCode: asc
      - season: asc
  - collection: calibration_log
    fields:
      - season: asc
      - eventCode: asc
      - settledAt: desc
```

---

## 7. Migración de datos existentes

Cuando se haga el deploy del schema federado:

1. `match_scouting` actual no tiene `scoutId`/`orgId` → backfill con `scoutId = legacy_unknown`, `orgId = "30311"` (asumir Iron Lions hasta confirmar lo contrario).
2. `pit_scouting` actual → docId pasa de `${season}_${teamNumber}` a `${season}_${teamNumber}_${orgId}`; backfill con `orgId = "30311"`.
3. Crear `org` doc para Iron Lions.
4. `users` se crea automáticamente al primer login post-deploy.

---

## 8. Ground-truth validation (cómo entra)

Sprint 1.7 implementa un job que:

1. Para cada `eventCode` activo, polea `ftc-events` API por matches con `actualScore` poblado.
2. Para cada match resuelto, suma los `auto/teleop/endgame` de las 3 entries de `match_scouting` de UN scout y compara contra el `scoreRedFinal` / `scoreBlueFinal` oficial.
3. Calcula error porcentual del scout en ese match.
4. Actualiza `users/{scoutId}.reliability` con EWMA (α=0.2) sobre los últimos N matches.

Esto **es el punto donde el modelo federado se hace defendible**. Sin ground-truth validation, no hay forma de distinguir un scout cuidadoso de un scout ruidoso, y los datos federados se contaminan.

---

## 9. Decisiones aplazadas

- **Multi-org por user:** un mismo usuario perteneciendo a varias orgs simultáneamente. Útil para mentores que ayudan a varios equipos. Post-julio.
- **Roles más granulares dentro de la org:** "drive coach", "strategist", "pit lead", "match scout". Post-julio. v1 = scout / lead / admin.
- **Public Brier score por org:** podría ser interesante pero genera competencia poco saludable. Post-julio si se decide hacer.
- **Diff visualizer entre dos scouts del mismo match:** UI para auditar conflictos. Post-julio si hay tiempo.
- **Federación entre regiones:** un equipo de Monterrey colaborando con uno de CDMX en datos cross-event. v1 = solo eventos comunes.

---

## 10. Próximas tareas que esto destraba

- **Sprint 1.1:** Refactor `match_scouting` schema con `scoutId` + `orgId`.
- **Sprint 1.2:** Lógica de agregación con reglas de §3.
- **Sprint 1.3:** UI "fuente del dato".
- **Sprint 1.5:** Super Scouting form con campos opt-in subjetivos.
- **Sprint 1.6:** Auth + invitación inter-org.
- **Sprint 1.7:** Ground-truth validation job.
