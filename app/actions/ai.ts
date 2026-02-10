"use server";

// In a real implementation, install @google/generative-ai
// npm install @google/generative-ai

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
const DEFAULT_MODEL = "gemini-3-pro-preview";

export async function chatWithAssistant(
    message: string,
    contextData: Record<string, unknown>,
    history: { role: 'user' | 'assistant', content: string }[] = [],
    model: string = DEFAULT_MODEL
) {
    if (!GEMINI_API_KEY) {
        return {
            role: "assistant",
            content: "AI Configuration Missing: Please set GOOGLE_GENERATIVE_AI_API_KEY in .env.local"
        };
    }

    try {
        const systemInstruction = `Eres un Asistente Senior de Estrategia para FTC (First Tech Challenge), trabajando específicamente para el equipo 30311 (Iron Lion).
                                
        Datos de Contexto: ${JSON.stringify(contextData)}
        
        **Instrucciones de Respuesta:**
        1. Analiza los datos a profundidad (Power Scores, Arquetipos, Tendencias).
        2. Responde SIEMPRE en ESPAÑOL DE MÉXICO con un tono profesional, emocionante y estratégico. Usa términos comunes de FTC (ej. Autónomo, Teleop, Colgar, Muestras, Especímenes).
        3. Estructura tus respuestas usando EMOJI HEADERS y puntos de lista. NO uses headers de Markdown (#).
        4. Para análisis de alianzas, incluye estas secciones: 🧠 ANÁLISIS ESTRATÉGICO, 🤝 SINERGIA Y ROLES, 🚜 ESTRATEGIA DE JUEGO, ⚠️ RIESGOS Y ALERTAS.
        5. Sé conversacional pero muy directo y accionable.`;

        // Format history for Gemini API
        const contents = history.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        // Add the current message
        contents.push({
            role: 'user',
            parts: [{ text: message }]
        });

        // Use v1beta for better model availability with common API keys
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                system_instruction: {
                    parts: [{ text: systemInstruction }]
                },
                contents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4000,
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: { message: "Unknown API error" } }));
            console.error(`AI API Error (${response.status}):`, JSON.stringify(errorData));
            return {
                role: "assistant",
                content: `AI API Error (${response.status}): ${errorData.error?.message || "Invalid request structure."}`
            };
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.warn("No text generated. Response data:", JSON.stringify(data));
            return {
                role: "assistant",
                content: "I couldn't generate a strategy for this combination. Please try a different query."
            };
        }

        return {
            role: "assistant",
            content: text
        };

    } catch (error: any) {
        console.error("AI Error:", error);
        return {
            role: "assistant",
            content: `Internal Error: ${error.message || "Connection failed"}. Please check your internet connection.`
        };
    }
}
