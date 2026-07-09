"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { chatWithAssistant } from "@/app/actions/ai";
import { useAuth } from "@/context/AuthContext";
import { Bot, Send, MessageSquare, ChevronDown, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";

export default function AssistantChat() {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
        { role: 'assistant', content: "Hello! I'm your FTC Strategy Assistant. I can help you analyze matches or pick alliance partners." }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const pathname = usePathname();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        if (isOpen) scrollToBottom();
    }, [messages, isOpen]);

    const processMessage = useCallback(async (userMsg: string) => {
        if (!userMsg.trim() || loading) return;

        // Current history before the new user message
        const currentHistory = [...messages];

        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            // The assistant action now requires a verified Firebase ID token.
            if (!user) {
                setMessages(prev => [...prev, { role: 'assistant', content: "Inicia sesión para usar el asistente de estrategia." }]);
                return;
            }
            const idToken = await user.getIdToken();

            const contextData = {
                page: pathname,
                timestamp: new Date().toISOString(),
            };

            // Pass the existing conversation history to maintain context
            const response = await chatWithAssistant({
                idToken,
                message: userMsg,
                contextData,
                history: currentHistory,
            });
            setMessages(prev => [...prev, { role: 'assistant', content: response.content }]);
        } catch (error) {
            console.error("Chat Error:", error);
            setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I'm having trouble connecting to the AI core. Please check your connection or API key." }]);
        } finally {
            setLoading(false);
        }
    }, [loading, pathname, messages, user]);

    useEffect(() => {
        const handleOpenChat = (e: Event) => {
            const { detail } = e as CustomEvent<{ message?: string }>;
            setIsOpen(true);
            if (detail.message) {
                // Trigger analysis automatically when coming from the Oracle
                setTimeout(() => {
                    processMessage(detail.message!);
                }, 300); // Slight delay for the opening animation
            }
        };

        window.addEventListener('open-ai-chat', handleOpenChat);
        return () => window.removeEventListener('open-ai-chat', handleOpenChat);
    }, [processMessage]);

    const handleSend = () => {
        if (!input.trim()) return;
        const msg = input;
        setInput("");
        processMessage(msg);
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
            {/* Chat Window Container */}
            <div className={`pointer-events-auto transition-all duration-300 ease-out transform origin-bottom-right mb-4 ${isOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-10 pointer-events-none h-0'}`}>
                <div className="w-[350px] md:w-[380px] bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[600px] ring-1 ring-slate-900/5">
                    {/* Header */}
                    <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center sticky top-0 z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center border border-blue-200">
                                <Bot className="text-blue-600 w-5 h-5" />
                            </div>
                            <div>
                                <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                                    Iron Lion AI <Sparkles size={12} className="text-amber-500 fill-amber-500" />
                                </div>
                                <div className="text-[10px] text-slate-500 font-medium tracking-wide">Strategic Advisor</div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-700 transition-all"
                        >
                            <ChevronDown size={18} />
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div className="h-[400px] overflow-y-auto p-4 flex flex-col gap-4 bg-slate-50/30 custom-scrollbar">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3.5 rounded-2xl text-sm leading-relaxed shadow-sm border ${m.role === 'user'
                                    ? 'bg-blue-600 text-white border-blue-600 rounded-br-none'
                                    : m.content.includes("error") || m.content.includes("Sorry")
                                        ? 'bg-red-50 text-red-700 border-red-100 rounded-bl-none whitespace-pre-wrap'
                                        : 'bg-white text-slate-700 border-slate-200 rounded-bl-none whitespace-pre-wrap'
                                    }`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start w-full animate-in fade-in zoom-in duration-300">
                                <div className="bg-white border border-slate-200 p-3 rounded-2xl rounded-bl-none flex items-center gap-2 shadow-sm">
                                    <div className="flex space-x-1.5 h-4 items-center px-1">
                                        <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                        <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                        <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce"></div>
                                    </div>
                                    <span className="text-xs text-slate-400 font-medium">Analyzing...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="p-3 bg-white border-t border-slate-100 flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Ask about strategy..."
                            className="flex-1 bg-slate-100/50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all font-medium placeholder:text-slate-400"
                            disabled={loading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            className="w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:grayscale rounded-xl text-white transition-all shadow-md active:scale-95 flex items-center justify-center flex-shrink-0"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Floating Toggle Button */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="pointer-events-auto w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full shadow-lg flex items-center justify-center text-white transition-all transform hover:scale-110 active:scale-95 border-2 border-white"
                >
                    <MessageSquare size={26} fill="white" />
                </button>
            )}
        </div>
    );
}
