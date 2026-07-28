"use server";

import { getAdminAuth } from "@/lib/firebase-admin";
import { getRedis } from "@/lib/redis";
import { getAppConfig } from "@/lib/app-config";
import {
    AI_LIMITS,
    capContext,
    resolveModel,
    sanitizeHistory,
    validateMessage,
    type ChatTurn,
} from "@/lib/ai-guards";

/**
 * AI strategy assistant — server action proxying to Google Gemini.
 *
 * SECURITY (C3 hardening). This action spends a paid third-party API on the
 * server's key, so it is a denial-of-wallet / open-proxy target. Four gates:
 *
 *   1. Auth: a verified Firebase ID token is required. Anonymous callers are
 *      rejected before any upstream request — closes the "anyone can burn the
 *      Gemini budget" hole.
 *   2. Model allow-list: the model id is resolved server-side from a fixed
 *      map. It is NEVER taken from client input, so a caller can't inject an
 *      arbitrary path into the `…/models/{model}:generateContent` URL and
 *      turn the app into a general-purpose LLM proxy tied to our key.
 *   3. Per-user rate limit (Redis fixed window): caps requests/user/minute so
 *      an authenticated user can't loop the endpoint. No-ops if Redis is
 *      unconfigured (consistent with the rest of the app; auth still holds).
 *   4. Input caps: message length, history turns + total size, and serialized
 *      context size are all bounded before anything reaches Gemini.
 */

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

// Rate limit key prefix (window + count bounds live in AI_LIMITS).
const RL_PREFIX = "ai:rl:";

type AssistantReply = { role: "assistant"; content: string };

function reply(content: string): AssistantReply {
    return { role: "assistant", content };
}

export async function chatWithAssistant(input: {
    idToken: string;
    message: string;
    contextData?: Record<string, unknown>;
    history?: ChatTurn[];
    /** Optional model tier key — validated against the server allow-list. */
    modelTier?: string;
}): Promise<AssistantReply> {
    const { idToken, message, contextData = {}, history = [], modelTier } = input ?? {};

    // 1. Auth — reject anonymous callers before touching the paid API.
    if (!idToken || typeof idToken !== "string") {
        return reply("Inicia sesión para usar el asistente de estrategia.");
    }
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        uid = decoded.uid;
    } catch {
        return reply("Tu sesión expiró. Vuelve a iniciar sesión para continuar.");
    }

    if (!GEMINI_API_KEY) {
        return reply("AI Configuration Missing: Please set GOOGLE_GENERATIVE_AI_API_KEY in .env.local");
    }

    // Runtime config (superadmin console): master switch + tunables. Read is
    // Redis-cached (60s) so this adds no meaningful latency per request.
    const appConfig = await getAppConfig();
    if (!appConfig.features.aiAssistant) {
        return reply("El asistente de IA está desactivado por el administrador.");
    }

    // 4a. Message validation (before rate-limit spend so junk doesn't consume quota).
    const validated = validateMessage(message);
    if (!validated.ok) {
        return reply(
            validated.reason === "empty"
                ? "Escribe una pregunta para analizar."
                : `Tu mensaje es muy largo (máximo ${AI_LIMITS.maxMessageChars} caracteres). Resúmelo e intenta de nuevo.`,
        );
    }
    const trimmed = validated.value;

    // 3. Per-user rate limit. No-op when Redis isn't configured.
    const redis = getRedis();
    if (redis) {
        try {
            const key = RL_PREFIX + uid;
            const count = await redis.incr(key);
            if (count === 1) await redis.expire(key, AI_LIMITS.rateWindowSeconds);
            // Ceiling comes from runtime config (superadmin-tunable), not the
            // compile-time constant — AI_LIMITS keeps the default.
            if (count > appConfig.ai.rateMaxPerWindow) {
                return reply("Vas muy rápido — espera un momento antes de la siguiente consulta.");
            }
        } catch (e) {
            // Rate-limit backend hiccup shouldn't hard-fail the feature; log and continue.
            console.warn("[ai] rate-limit check failed, allowing request:", e);
        }
    }

    // 4b. Bound the remaining inputs.
    const cleanHistory = sanitizeHistory(history);
    const contextJson = capContext(contextData);

    try {
        const systemInstruction = `Eres un Asistente Senior de Estrategia para FTC (First Tech Challenge), trabajando específicamente para el equipo 30311 (Iron Lion).

        Datos de Contexto: ${contextJson}

        **Instrucciones de Respuesta:**
        1. Analiza los datos a profundidad (Power Scores, Arquetipos, Tendencias).
        2. Responde SIEMPRE en ESPAÑOL DE MÉXICO con un tono profesional, emocionante y estratégico. Usa términos comunes de FTC (ej. Autónomo, Teleop, Colgar, Muestras, Especímenes).
        3. Estructura tus respuestas usando EMOJI HEADERS y puntos de lista. NO uses headers de Markdown (#).
        4. Para análisis de alianzas, incluye estas secciones: 🧠 ANÁLISIS ESTRATÉGICO, 🤝 SINERGIA Y ROLES, 🚜 ESTRATEGIA DE JUEGO, ⚠️ RIESGOS Y ALERTAS.
        5. Sé conversacional pero muy directo y accionable.`;

        const contents = cleanHistory.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));
        contents.push({ role: "user", parts: [{ text: trimmed }] });

        // 2. Model resolved server-side from the allow-list — never interpolated
        // from raw client input. Config's tier is the default when the client
        // doesn't ask for one. Key stays in the query string as before.
        const model = resolveModel(modelTier ?? appConfig.ai.modelTier);
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemInstruction }] },
                    contents,
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 4000,
                    },
                }),
            },
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: "Unknown API error" } }));
            console.error(`AI API Error (${response.status}):`, JSON.stringify(errorData));
            return reply(`AI API Error (${response.status}): ${errorData.error?.message || "Invalid request structure."}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.warn("No text generated. Response data:", JSON.stringify(data));
            return reply("No pude generar una estrategia para esta combinación. Intenta con otra pregunta.");
        }

        return reply(text);
    } catch (error: unknown) {
        console.error("AI Error:", error);
        const msg = error instanceof Error ? error.message : "Connection failed";
        return reply(`Internal Error: ${msg}. Please check your internet connection.`);
    }
}
