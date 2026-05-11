'use client';

import { Sparkles, AlertTriangle } from 'lucide-react';

interface CharacterCounterProps {
    current: number;
    max: number;
}

export default function CharacterCounter({ current, max }: CharacterCounterProps) {
    const isOver = current > max;
    const isWarning = current > max * 0.9;

    return (
        <div className="flex items-center justify-end gap-2 mt-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-300 ${
                isOver 
                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' 
                : isWarning 
                ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' 
                : 'bg-indigo-50 text-indigo-600 border-indigo-200'
            }`}>
                {isOver ? (
                    <AlertTriangle className="w-3 h-3 animate-pulse" />
                ) : (
                    <Sparkles className="w-3 h-3" />
                )}
                <span>
                    {current} <span className="opacity-50">/</span> {max}
                </span>
            </div>
        </div>
    );
}
