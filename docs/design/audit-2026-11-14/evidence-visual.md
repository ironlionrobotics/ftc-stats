# Evidencia visual y de accesibilidad — PRIDE (2026-11-14)

Solo hechos medidos, sin puntuar. Build de produccion en http://localhost:3108, rama etapa1/foundations.

## 1. Sources consulted

- Navegador: Playwright MCP (Chromium). Medicion con un script inyectado (`window.__measure`, via `addInitScript`) que recorre elementos visibles del DOM y lee `getComputedStyle`. Ningun archivo del repo fue editado.
- Pantallas: `/`, `/events`, `/event/USMIRHQ`, `/teams`, `/team/30311`, `/scouting`, `/strategy`, `/workshop`, `/lending`, `/card`.
- Viewports: 390x844 (todas las pantallas, dark y light); 820x1180 (`/`, `/event/USMIRHQ`, `/team/30311`, `/strategy`, solo dark).
- Preparacion: cookie `pride_team=30311` fijada con `context.addCookies` (no httpOnly; se verifico en `document.cookie`). Tema fijado con `localStorage["ftc-theme"]={"state":{"theme":"dark|light"},"version":0}`; verificado: dark => `<html class="dark">`, light => `<html class="">`, body bg `rgb(7,8,10)` / `rgb(242,243,245)`. Sin login ni credenciales.
- Rutas de estado: `/event/ZZZZZZ`, `/team/99999999`, `/nonexistent-page`.
- Repo (solo lectura): `app/globals.css` (tokens), existencia de `app/loading.tsx`, `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`; grep de skip-link y `prefers-reduced-motion`.
- Capturas: `/home/hector/Proyectos/FTC-Stats/docs/design/audit-2026-11-14/shots/`.

Nota de metodo: el widget flotante "Iron Lion AI" (panel de chat) existe en el DOM con opacity 0 en todas las pantallas; da contraste calculado 1:1 en mi script. Esos elementos se excluyeron de la lista de contrastes (no estan visibles). Los chequeos de contraste ignoran fondos con gradiente/imagen (la bandera `IMG` no aparecio en ningun hallazgo).

## 2. Findings

### 1. Escala de espaciado observada (margin/padding/gap, top 15 por frecuencia)

Valores distintos por pantalla (dark = light, mismo layout): home 13, events 13, event 14, teams 12, team 20, scouting 12, strategy 12, workshop 10, lending 11, card 11.

| Pantalla | Top valores (px:conteo) |
|---|---|
| home | 12:41 8:33 16:31 4:13 2:11 6:8 24:4 14:4 40:2 10:2 56:1 20:1 32:1 |
| events | 16:104 8:90 4:84 6:80 10:60 12:21 24:16 32:12 2:11 48:5 14:4 56:1 40:1 |
| event | 16:208 6:164 20:144 8:131 4:90 12:56 24:34 2:24 10:22 14:4 32:3 56:1 48:1 40:1 |
| teams | 10:38 16:31 8:25 6:20 12:20 2:11 24:9 4:9 48:4 14:4 56:1 40:1 |
| team | 16:500 12:384 4:157 8:138 6:135 10:122 2:66 20:61 24:60 40:12 32:11 48:4 14:4 56:1 64:1 |
| scouting | 16:35 8:32 12:21 2:11 6:8 4:6 14:4 32:2 24:2 10:2 56:1 36:1 |
| strategy | 8:41 16:30 12:23 2:12 4:10 6:8 24:5 32:5 14:4 10:2 56:1 36:1 |
| workshop / card | 12:18 16:16 8:15 2:11 6:8 24:7 (card: 4:5 40:4) 14:4 10:2 56:1 |
| lending | 12:20 8:17 16:16 2:11 6:8 24:7 4:6 14:4 10:2 56:1 20:1 |

Valores que aparecen en el conjunto: 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 36, 40, 48, 56, 64. Valores fuera de multiplos de 4: 2, 6, 10, 14 (6 y 10 con cientos de apariciones en `event`/`events`).

### 2. Escala tipografica observada

Tamanos de fuente (px:conteo de elementos con texto), dark = light:

- home: 10:1 11:6 12:29 14:10 15:1 16:9 24:1 36:1
- events: 10:10 11:14 12:44 14:8 15:1 16:19 18:2 20:1 30:2 36:1
- event: 9:3 10:88 11:7 12:8 14:14 15:1 16:37 18:36 20:36 30:4 36:4
- teams: 10:10 11:6 12:2 14:6 15:1 16:3 20:1 30:1
- team: 9:39 10:41 11:81 12:118 14:166 15:5 16:46 18:20 20:13 24:14 30:4 36:3
- scouting: 10:2 11:6 12:4 14:6 15:1 16:1 18:1
- strategy: 10:1 11:6 12:7 14:10 15:1 16:2 36:1
- workshop / lending / card: 10:1 11:6 12:2-3 14:4 15:1 16:2 30:1

Conjunto total de tamanos: 9, 10, 11, 12, 14, 15, 16, 18, 20, 24, 30, 36. Textos de 9-11 px: event 98 elementos, team 161, home 7.

Pesos: home 400:28 700:19 600:8 900:2 500:1; event 700:137 900:90 400:10 500:1; team 700:210 400:197 900:93 500:20 600:20 800:10.

Familias renderizadas: (a) `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif` (cuerpo; 44 de 58 elementos en home, 235 de 238 en event); (b) `"DIN Alternate", Bahnschrift, "Roboto Condensed", "Arial Narrow", ui-…` (display; 14 en home, 175 en team, 3 en event). No hay fuentes web cargadas (pila de sistema).

### 3. Colores distintos (computed)

Dark (primarios por rol; lista completa de conteos en las pantallas capturadas):
- Texto: `243,244,246` (foreground), `139,146,161` (muted), `7,8,10` (sobre fondo claro), `60,207,126` (success), `240,180,41` (warning), `255,77,87`, `77,125,255`. Distintos por pantalla: home 6, events 4, event 5, teams 3, team 12, scouting 3, strategy 4, workshop 3, lending 3, card 3.
- Fondos solidos: `7,8,10` (body), `16,18,23`, `24,27,34`, `243,244,246`, `77,125,255`, `60,207,126`, `240,180,41`, mas variantes translucidas en oklab (alpha 0.05–0.95). Distintos: home 8, events 10, event 9, teams 8, team 24, scouting 9, strategy 9, workshop 7, lending 8, card 7.
- Bordes: `34,39,49` domina (home 18, events 37, event 129, team 109); distintos: home 5, events 4, event 7, team 14, resto 4-5.

Light:
- Texto: `12,14,18`, `93,99,112` (muted), `255,255,255`, `19,128,74` (success), `165,104,10` (warning), `214,48,58`, `36,87,214`. Distintos: home 6, events 4, event 5, teams 3, team 12, scouting 3, strategy 4, workshop/lending/card 3.
- Fondos: `242,243,245` (body), `255,255,255`, `232,234,238`, `12,14,18`, `36,87,214`, mas oklab translucidos. Distintos: home 8, events 10, event 9, teams 8, team 24, scouting 9, strategy 9, workshop 7, lending 8, card 7.
- Bordes: distintos home 5, events 4, event 7, teams 4, team 14, resto 4-5.

Tokens (`app/globals.css`): `--color-secondary` = alliance blue (#2457d6 light, #4d7dff dark); `--color-danger` = alliance red (#d6303a / #ff4d57); `--color-primary` = tinta (#0c0e12 / #f3f4f6). `secondary-foreground` declarado #ffffff.

**Uso del rojo/azul de alianza en elementos NO de alianza** (selector / texto / pantalla; mismo hallazgo en light con #d6303a/#2457d6):

Azul (token `secondary`):
- Boton flotante del chat IA: `button.pointer-events-auto.w-14.h-14` fondo azul, y boton enviar del panel `button.w-10.h-10.bg-secondary` — presentes en TODAS las pantallas (10/10).
- Enlace "PRO" `a.shrink-0.flex.items-center` en `/event/USMIRHQ` (fila de pestanas).
- Enlace "Visit Website" `a.flex.items-center.gap-2` en `/team/30311`.
- Enlaces "FTCScout — team profile 30311", "FTCScout GraphQL API…", "FTCScout — events MXSTQ…" `a.inline-flex.items-center.gap-1` en `/team/30311`.
- Badge "Championship" `span.inline-block.px-2.5.py-1` en `/team/30311`.
- Chips de ranking "#2/#5/#7/#8" `div.px-3.py-1.5.rounded-xl` con fondo azul en `/team/30311`.
- Barra de progreso `div.absolute.inset-y-0.left-0` y leyenda `span.inline-block.w-3.5.h-3.5` / `span.inline-block.w-5.h-0.5` (serie de grafico) en `/team/30311`.
- Cifras de tabla `td.px-4.py-3.text-center` (19 celdas: 34.4…139.1) y `td.px-4.py-4.text-center` (4), y `div.font-mono.font-bold.text-secondary` (267, 253, 252, 251, 238) en `/team/30311`; `div.font-display.font-black.text-2xl` "79%".
- `span.text-3xl.font-bold.text-secondary` "0" en `/events` (contador).
- Fondo `bg-secondary` en 4 de 5 `noName` de cada pantalla (boton chat).

Rojo (token `danger`):
- `div.font-display.font-black.text-2xl` "−15.2" y `span.font-bold.text-danger` "10%" / "30%" en `/team/30311` (valores negativos / porcentajes bajos).

Usos de alianza que SI son de alianza (para referencia): `/` "Last Final: 205–122" (rojo 205, azul 122); `/event/USMIRHQ` badges "RED ALLIANCE" x2 / "BLUE ALLIANCE" x1.
No aparecen rojo/azul de alianza en `/scouting`, `/strategy`, `/workshop`, `/lending`, `/card` salvo el boton de chat (global). Tab activo del nav: texto/fondo en `primary` (no azul): home Today aparece en blanco, `aria-current=page`.

### 4. Contraste (WCAG, texto vs fondo efectivo; umbral 4.5, grande 3.0)

Dark:
- home, events, teams, scouting, strategy, workshop, lending, card: 0 textos visibles bajo umbral (solo los falsos positivos opacity 0 del chat).
- event: 0 visibles bajo umbral en texto (el "→" `span.text-lg` x36 que aparecio es de color 243,244,246 sobre 16,18,23 con opacity 0 acumulada del padre; no visible en captura; no contado).
- team: 4 textos bajo 4.5 — chips `div.px-3.py-1.5.rounded-xl` "#2", "#8", "#5", "#7" texto 14px `rgb(243,244,246)` sobre `rgb(77,125,255)` = **3.35:1**.
- Muted dark `139,146,161` sobre `7,8,10` y sobre `24,27,34`: no aparece en la lista de fallos (>= 4.5).

Light:
- home: 1 — `span.font-semibold.text-success` "Live" 12px `rgb(19,128,74)` sobre `rgb(242,243,245)` = **4.49:1**.
- team: 5 — "#2/#8/#5/#7" texto `rgb(12,14,18)` sobre `rgb(36,87,214)` = **3.14:1**; "Inspire 1st" `span.text-[11px].font-bold.px-2` `rgb(165,104,10)` sobre `rgb(242,243,245)` = **4.13:1**.
- events, event, teams, scouting, strategy, workshop, lending, card: 0 visibles bajo umbral.

### 5. Estados (donde observable)

| Estado | Evidencia |
|---|---|
| Empty | PRESENTE: `/` "No events registered for this team in season 2026 yet."; `/events` y `/teams` "No se encontraron equipos bajo estos criterios." (texto en espanol sobre UI en ingles); `/event/USMIRHQ` "NO CREATORS"; `/scouting` texto "…yet. Type a team number in the search box to scout it". |
| Error | PRESENTE: `/event/ZZZZZZ` responde HTTP 200, h1 "Event Not Found", cuerpo en espanol ("No encontramos el evento ZZZZZZ en las temporadas 2026, 2025, 2027…"), sin boton/enlace de accion (actions=[]). `/team/99999999` y `/nonexistent-page`: pagina 404 "Page not found" con enlace "Go to Today" (`/nonexistent-page` HTTP 404; `/team/99999999` HTTP 200). `app/error.tsx` y `app/global-error.tsx` existen; no se provoco un error de runtime. |
| Loading | Archivo `app/loading.tsx` existe; en las pantallas cargadas con networkidle: skeleton/animate-pulse = 0 en 9 pantallas, 1 en `/team/30311`. No se observo un skeleton en pantalla (carga rapida). |
| Success | No observado (no se ejecutaron mutaciones). Hay `[role=status]/[aria-live]` = 1 por pantalla. |
| Focus | PRESENTE (ver 7). |
| Disabled | `:disabled/[aria-disabled]` = 1-2 por pantalla (home 2, scouting 2, resto 1); no se inspeccionaron visualmente. |
| Gated | `/workshop`: tarjeta "Sign in with your team to log practice."; `/scouting`, `/lending`, `/card` muestran estado sin sesion (contenido minimo: docH 900-956 px; h1 "Pit lending", "Trading Card"; `/scouting` sin h1, solo h2 "Teams"). |
| Offline | No probado. |

### 6. Touch targets (< 44x44 px, viewport 390)

| Pantalla | <44 / interactivos |
|---|---|
| home | 20 / 27 |
| events | 14 / 40 |
| event | 17 / 59 |
| teams | 10 / 18 |
| team | 17 / 25 |
| scouting | 13 / 19 |
| strategy | 10 / 22 |
| workshop | 8 / 14 |
| lending | 9 / 15 |
| card | 8 / 14 |

Ejemplos (alto x ancho): logo `a "PRIDE"` 51x24; `button "30311"` (cuenta) 95x40; link `a.block.truncate "Rochester Qualifier"` 216x24; boton Unfollow (estrella) 40x40; `input#follow-team-n` 96x40; pestanas del evento `button "Teams/Rankings/Matches/…"` 103–155 x 42; "By Criteria" 100x32; "Rankings" (tabs de /teams) 97x36; chat toggle `button.w-8.h-8` 29x29; boton enviar chat 36x36; "Install" 62x28; "Don't show again" 28x28; `select` 324x39; `a "VIEW EVENT DETAILS"` 308x38; links FTCScout 191x16 y 321x16; "Scout board" 324x40; "ADVANCED" 69x25. Pestanas de `/strategy` (`min-h-[44px]`) cumplen 44.

### 7. Accesibilidad

- Landmarks por pantalla (header/nav/main/footer/aside/region/search/form total): home 14 (main 1), events 11 (main 1, footer 1), event 9 (**main 0**), teams 10 (main 1), team 8 (**main 0**), scouting 9 (main 1), strategy 9 (**main 0**), workshop 9 (**main 0**), lending 9 (**main 0**), card 9 (**main 0**).
- Skip link: **no** (en ninguna pantalla; los dos primeros enlaces del DOM son "PRIDE -> /" y "Today -> /"; grep de "skip"/"saltar" en `app` y `components` sin resultados).
- H1: 1 por pantalla excepto `/scouting` (0, solo h2 "Teams").
- Controles sin nombre accesible (en cada pantalla): `button.w-8.h-8.flex` (toggle del chat), `input.flex-1.bg-muted.border` (chat, placeholder "Ask about strategy..."), `button.w-10.h-10.bg-secondary` (enviar), `button.pointer-events-auto.w-14.h-14` (FAB chat). Ademas: `/events` 5 inputs/selects sin label (`select.w-full.md:w-64`, `select.w-full.p-2.5` x2, `input.w-full.p-2.5` x2); `/event` `input.w-full.h-2.bg-muted` (slider) y `input.w-full.pl-10.pr-4` (placeholder "Search by team # or name..."); `/teams` `input.pl-10.pr-4.py-3` ("Buscar equipo..."); `/scouting` `input.w-full.pl-9.pr-4` ("Search...") sin `aria-label`/`label`. En `/` hay `<label class="sr-only">` para Region y Search events.
- ARIA: estrella de seguir `aria-label="Unfollow …"` con `aria-pressed=true`; nav `aria-current="page"` en Today (los demas null); cuenta `aria-label="Account and settings"`. Pestanas del evento (Teams, Rankings, Matches, Oracle, …): `button` sin `role=tab`, sin `aria-selected`, sin `aria-pressed`, contenedor sin role.
- Orden de tab (phone dark, 16 pulsaciones) en `/`: 1 PRIDE (a), 2 30311 (cuenta), 3-7 tab bar inferior (Today, Events, Teams, Scouting, Strategy), 8 "Rochester Qualifier", 9 Unfollow, 10 "7252 Vicious Volts", 11 "Rochester Qualifier", 12 Unfollow, 13 input team, 14 "Turn on notifications", 15 select region, 16 input "Name or code". El tab bar fijo inferior se recorre antes del contenido principal.
- Orden en `/event/USMIRHQ`: PRIDE, 30311, Today…Strategy (5), luego pestanas Teams, Rankings, Matches, Oracle, Advancement, Awards, enlace PRO, un input (slider), input de busqueda.
- Anillo de foco visible: si en todos los elementos (`:focus-visible` true, `outline: solid 2px rgb(243,244,246)` en home). En las pestanas de event: `outline solid 3px rgb(7,8,10)`+box-shadow en la primera, `solid 3px rgb(139,146,161)` en las siguientes, `3px rgb(77,125,255)` en "PRO". El input de busqueda en `/event` tiene `outline: none` con box-shadow como anillo. Captura: `phone-dark-home-focus.png`, `phone-dark-event-focus.png`.
- Alcanzable por teclado: seguir equipo (estrella, Unfollow, input+Follow), abrir evento (enlaces), cambiar pestanas del evento (botones en el orden de tab), tab bar. Pestanas de event no usan flechas (no tienen role tablist).
- `lang="en"`; `prefers-reduced-motion` presente en `app/globals.css:192`; viewport `width=device-width, initial-scale=1, viewport-fit=cover`; `theme-color` `#07080a`.

### 8. Layout en telefono (390x844)

- Desbordamiento horizontal del documento: **ninguno** (scrollWidth 390 = innerWidth 390 en las 20 combinaciones).
- Alturas de documento: home 1191, events 3868, event 9126, teams 900, team 15162, scouting 956, strategy/workshop/lending/card 900.
- Barra inferior fija: `nav.md:hidden.fixed.inset-x-0` top=787, alto 57 px (variable `--tabbar-h: calc(56px + 0px)`). Header sticky `header.md:hidden.sticky.top-0` alto 56 px. Fuera de la barra, `fixed` adicionales en todas las pantallas: FAB de chat (boton 56x56, azul) y banner "Install PRIDE" (`fixed bottom-[calc(var(--tabbar-h)+…)]`, top=673, alto 99, ancho ~316) — solapa el contenido; en `/` se ve cubriendo parte de la tarjeta "Notifications on this device" (captura `phone-dark-home.png`). El banner aparece en home, events, event, teams y team en la medicion (no en las demas).
- Elementos con ancho fuera de pantalla (scroll interno horizontal): tabla de `/events` y `/teams` (`table.w-full` right=651, 8 columnas "# EQUIPO RS MATCH BASE AUTO MÁ…"); tabla de `/team` (`table.min-w-[560px]`, right=598); fila de pestanas de `/event` (Oracle right=467, Advancement 622, Awards 732, PRO 821); pestanas de `/strategy` (Match Simulator right=461, Briefing 573, Live Ranking 719).
- Truncado: `p.truncate` "Live · Nov 13–Nov 14 · Rochest…" en home (sw 327 / cw 306); tarjetas de `/event` (`div.relative.overflow-hidden.p-6`, sw 372 / cw 356) y de `/team` (eventos MXSTQ/MXMOQ/MXCMP/FPEMX `div.bg-card.border`, sw 403 / cw 356); avatar `div.w-32.h-32` "30311" (sw 127 / cw 120).
- Cabecera `/team`: dos H3 con cifras "205 / 185 / 56" aparecen como h3 (encabezados de datos).
- Idioma mezclado en una misma pantalla: `/events` y `/teams` (cabeceras "EQUIPO", "MÁ…", "Buscar equipo...", estado vacio en espanol) con navegacion y titulos en ingles; `/team/30311` titulos en espanol ("Un rookie con rendimiento…", "Desglose de habilidades") con nav en ingles; `/event/ZZZZZZ` mensaje de error en espanol bajo h1 en ingles.

### 9. Tablet 820x1180 (dark)

- Layout: rail izquierdo `ASIDE` `position: fixed`, 224 px de ancho x 1180 de alto (contiene Today/Events/Teams/Scouting/Strategy, bloque "MORE": Data Lab, Model accuracy, Trading Card, Pit lending, Workshop; buscador "Team number"; pie con cuenta "30311 / Sign in"). Tab bar inferior no visible (solo rail).
- Contenido: `main.max-w-5xl` en x=224, ancho 596 (en home); en `/team` `div.max-w-7xl` 596 de ancho, doc 12693 px de alto. h1 de home en 256,60.
- Columnas: home grid de 2 columnas (2 tarjetas "Following" lado a lado, 2 grids); event 2 grids de 2 columnas; team grids de 2 col x11, 3 col x4, 4 col x1; strategy sin grids de varias columnas (docH 1180, contenido minimo sin sesion).
- Chat FAB y banner "Install PRIDE" siguen `fixed` (banner 317x99 en x=248; panel 380x72).
- scrollWidth 820 = innerWidth (sin desbordamiento).
- Capturas: `tablet-dark-home.png`, `tablet-dark-event.png`, `tablet-dark-team.png`, `tablet-dark-strategy.png`.

## 3. Per-principle facts

**Aesthetic (#3)**
- Paleta dark: fondos `7,8,10` / `16,18,23` / `24,27,34`, texto `243,244,246` y `139,146,161`; solo 3-12 colores de texto distintos por pantalla (team 12). Pila tipografica de sistema + pila condensada "DIN Alternate…" para display.
- Rojo/azul de alianza tambien se usan como acento general (boton de chat, enlaces, chips de ranking, cifras de tabla, barras de grafico) en 6 de 10 pantallas medidas; azul `secondary` coincide con el token alliance-blue (misma variable CSS).
- Escala de espaciado con valores 2/6/10/14 ademas de multiplos de 4; 12 tamanos de fuente distintos en total (9–36 px); 9 y 10 px aparecen en 227 elementos entre event y team.
- Capturas de referencia: `phone-dark-home.png`, `tablet-dark-home.png`, `phone-light-*.png`.

**Unobtrusive (#5)**
- En todas las pantallas aparecen 2 elementos superpuestos no solicitados: FAB azul de chat IA (56x56) y, en 5 pantallas, banner "Install PRIDE" (99 px de alto) sobre el tab bar; en home cubre contenido (ver `phone-dark-home.png`).
- Hay 1 solo `main` de 10 pantallas en 4 (home, events, teams, scouting); el resto no tiene landmark main.
- Rail de escritorio fijo y tab bar movil de 57 px consistentes.

**Thorough (#8)**
- Estados: empty en 5 pantallas, error en 3 rutas (404 / Event Not Found), `loading.tsx`/`error.tsx`/`global-error.tsx`/`not-found.tsx` existen. Success y offline no observados.
- 4 controles sin nombre accesible en todas las pantallas (chat), hasta 5 campos sin label en `/events`.
- Sin skip-link; pestanas de evento sin `role=tab`/`aria-selected`.
- Mezcla es/en dentro de una misma pantalla (ver 8).
- Contraste: 4 textos <4.5 en dark (chips "#n" 3.35), 6 en light (chips 3.14, "Inspire 1st" 4.13, "Live" 4.49).

**Useful (#2)**
- `/` con equipo seguido: tarjeta del evento live con ranking top 4 y ultimo final, tarjeta del equipo (#1 de 36, 5-0-0), seguir otro equipo, notificaciones, eventos de los proximos 7 dias.
- `/workshop`, `/scouting`, `/lending`, `/card` sin sesion muestran un estado minimo (mensaje de login / buscador de equipos); no se evaluo el contenido autenticado.
- `/event/ZZZZZZ` (error) no ofrece accion (0 enlaces/botones); `/team/99999999` y 404 ofrecen "Go to Today".
- Tabs principales alcanzables en 1 pulsacion de tab-bar; en `/event` las pestanas estan fuera de pantalla a la derecha (Oracle desde x=467) y requieren scroll horizontal.

## 4. Known gaps

- No se hizo login: pantallas de equipo con sesion (scouting activo, workshop, lending, card con datos, panel de cuenta) no evaluadas.
- Success, loading real (skeleton) y offline no observados; disabled solo contado, no inspeccionado.
- Contraste calculado por script; no maneja fondos con gradiente/imagen ni texto sobre canvas/SVG; texto dentro de graficos SVG no medido.
- Elementos con opacity 0 (panel del chat IA) excluidos de la lista; el chat no se abrio, por lo que su aspecto no se midio.
- Tab-through solo en phone dark en `/` y `/event/USMIRHQ`; no se probaron flechas, Enter/Space en pestanas ni trampas de foco en dialogos.
- Conteos de espaciado incluyen margin/padding de todo elemento visible (incluye valores heredados y de contenedores internos de iconos).
- Pantallas tablet en light no medidas (fuera del alcance).
- Las medidas de light/dark muestran la misma geometria (mismos conteos de fuentes/espaciado); solo cambian colores.

## 5. Archivos de capturas

`shots/phone-{dark,light}-{home,events,event,teams,team,scouting,strategy,workshop,lending,card}.png` (20), `shots/phone-dark-home-full.png`, `shots/phone-dark-event-full.png`, `shots/tablet-dark-{home,event,team,strategy}.png`, `shots/phone-dark-{home,event}-focus.png`, `shots/phone-dark-state-{badevent,badteam,notfound}.png`.
