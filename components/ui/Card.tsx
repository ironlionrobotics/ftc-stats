"use client";

import { clsx } from "clsx";
import { motion } from "framer-motion";
import { ReactNode } from "react";

interface CardProps {
    children: ReactNode;
    className?: string;
    delay?: number;
}

export function Card({ children, className, delay = 0 }: CardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
            className={clsx(
                "bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-xl",
                className
            )}
        >
            {children}
        </motion.div>
    );
}
