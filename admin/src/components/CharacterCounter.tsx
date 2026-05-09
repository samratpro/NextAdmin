'use client';

interface CharacterCounterProps {
    current: number;
    max: number;
}

export default function CharacterCounter({ current, max }: CharacterCounterProps) {
    const isOver = current > max;
    const isWarning = current > max * 0.9;

    return (
        <div className={`text-right text-xs mt-1 ${isOver ? 'text-red-600 font-bold' : isWarning ? 'text-orange-500' : 'text-gray-400'}`}>
            {current} / {max} characters
        </div>
    );
}
