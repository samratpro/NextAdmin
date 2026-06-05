import { Check, Trash2, ArrowRight } from 'lucide-react';

interface ActionBarProps {
    selectedCount: number;
    totalCount: number;
    onSelectAll: (checked: boolean) => void;
    onAction: (action: string) => void;
    actions: { label: string; value: string; dangerous?: boolean }[];
}

export default function ActionBar({
    selectedCount,
    totalCount,
    onSelectAll,
    onAction,
    actions
}: ActionBarProps) {
    const allSelected = selectedCount === totalCount && totalCount > 0;
    const someSelected = selectedCount > 0 && selectedCount < totalCount;

    return (
        <div className="flex items-center justify-between bg-white/80 backdrop-blur-md rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 transition-all duration-300 hover:shadow-md">
            <div className="flex items-center space-x-5">
                <label className="flex items-center space-x-3 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                        <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(input) => {
                                if (input) input.indeterminate = someSelected;
                            }}
                            onChange={(e) => onSelectAll(e.target.checked)}
                            className="peer h-5 w-5 opacity-0 absolute cursor-pointer z-10"
                        />
                        <div className={`h-5 w-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center
                            ${allSelected ? 'bg-indigo-600 border-indigo-600 shadow-sm' : someSelected ? 'bg-indigo-500 border-indigo-500 shadow-sm' : 'bg-white border-gray-300 group-hover:border-indigo-400'}`}>
                            {allSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3px]" />}
                            {someSelected && <div className="w-2.5 h-0.5 bg-white rounded-full" />}
                        </div>
                    </div>
                    <span className="text-sm font-semibold text-gray-700 group-hover:text-indigo-600 transition-colors">
                        Select all <span className="text-indigo-600">{totalCount}</span> items
                    </span>
                </label>

                {selectedCount > 0 && (
                    <div className="flex items-center animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="h-4 w-[1px] bg-gray-200 mr-5" />
                        <span className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 ring-4 ring-indigo-50/50">
                            {selectedCount} selected
                        </span>
                    </div>
                )}
            </div>

            {selectedCount > 0 && (
                <div className="flex items-center space-x-4 animate-in fade-in slide-in-from-right-2 duration-300">
                    <div className="relative group">
                        <select
                            onChange={(e) => {
                                if (e.target.value) {
                                    onAction(e.target.value);
                                    e.target.value = '';
                                }
                            }}
                            className="appearance-none block w-56 pl-4 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all cursor-pointer hover:bg-white"
                        >
                            <option value="">Choose an action...</option>
                            {actions.map((action) => (
                                <option
                                    key={action.value}
                                    value={action.value}
                                    className={action.dangerous ? 'text-red-600 font-semibold' : ''}
                                >
                                    {action.label}
                                </option>
                            ))}
                        </select>
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 group-hover:text-indigo-500 transition-colors">
                            <ArrowRight className="w-4 h-4 rotate-90" />
                        </div>
                    </div>
                    
                    <button
                        onClick={() => onAction('go')}
                        className="inline-flex items-center px-6 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-[0_4px_12px_rgba(79,70,229,0.25)] hover:shadow-[0_6px_20px_rgba(79,70,229,0.35)] active:scale-[0.98] font-bold text-sm"
                    >
                        Apply Action
                    </button>
                </div>
            )}
        </div>
    );
}
