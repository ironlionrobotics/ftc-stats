"use server";

// In a real implementation, install @google/generative-ai
// npm install @google/generative-ai

const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

export async function chatWithAssistant(message: string, contextData: Record<string, unknown>) {
    if (!GEMINI_API_KEY) {
        return {
            role: "assistant",
            content: "AI Configuration Missing: Please set GOOGLE_GENERATIVE_AI_API_KEY in .env.local"
        };
    }

    try {
        // Simple fetch implementation to avoid extra dependencies for now
        // This targets Gemini 1.5 Flash for speed
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `You are an expert FTC (First Tech Challenge) Strategy Assistant for team 30311.
                                Current Context Data: ${JSON.stringify(contextData).slice(0, 5000)}...
                                
                                User Query: ${message}
                                
                                Answer concisely and strategically.`
                            }
                        ]
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`AI API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate a response.";

        return {
            role: "assistant",
            content: text
        };

    } catch (error) {
        console.error("AI Error:", error);
        return {
            role: "assistant",
            content: "I encountered an error processing your request."
        };
    }
}
