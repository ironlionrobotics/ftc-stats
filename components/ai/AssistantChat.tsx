"use client";

import { useState, useRef, useEffect } from "react";
import { chatWithAssistant } from "@/app/actions/ai";
import { Bot, Send, X, MessageSquare, ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";

export default function AssistantChat() {
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

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        const userMsg = input;
        setInput("");
        setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setLoading(true);

        try {
            // Gather some context based on the current page
            // In a real app, this would be more sophisticated (e.g. reading current state state)
            const contextData = {
                page: pathname,
                timestamp: new Date().toISOString(),
                // Placeholder: In a real integration, we'd pass the currently viewed team or match data here
            };

            const response = await chatWithAssistant(userMsg, contextData);
            setMessages(prev => [...prev, { role: 'assistant', content: response.content }]);
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, something went wrong." }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
            {isOpen && (
                <div className="mb-4 w-80 md:w-96 bg-gray-900 border border-white/20 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200">
                    <div className="p-4 bg-gradient-to-r from-purple-900 to-indigo-900 flex justify-between items-center border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <Bot className="text-white w-5 h-5" />
                            <span className="font-bold text-white text-sm">Iron Lion AI</span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white transition-colors">
                            <ChevronDown size={20} />
                        </button>
                    </div>

                    <div className="h-96 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-950/95 backdrop-blur-sm">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${m.role === 'user'
                                        ? 'bg-primary text-white rounded-br-none'
                                        : 'bg-white/10 text-gray-200 rounded-bl-none'
                                    }`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-white/10 text-gray-400 p-3 rounded-2xl rounded-bl-none text-xs animate-pulse">
                                    Analyzing strategies...
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="p-3 bg-gray-900 border-t border-white/10 flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Ask about strategies..."
                            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            className="p-2 bg-primary hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-white transition-colors"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                </div>
            )}

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-14 h-14 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-full shadow-[0_0_20px_rgba(124,58,237,0.5)] hover:shadow-[0_0_30px_rgba(124,58,237,0.7)] flex items-center justify-center text-white transition-all transform hover:scale-105 active:scale-95"
            >
                {isOpen ? <X size={28} /> : <MessageSquare size={28} />}
            </button>
        </div>
    );
}
