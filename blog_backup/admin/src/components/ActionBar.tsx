'use client';

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
        <div className="flex items-center justify-between bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(input) => {
                            if (input) input.indeterminate = someSelected;
                        }}
                        onChange={(e) => onSelectAll(e.target.checked)}
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">
                        Select all {totalCount} items
                    </span>
                </label>

                {selectedCount > 0 && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800">
                        {selectedCount} selected
                    </span>
                )}
            </div>

            {selectedCount > 0 && (
                <div className="flex items-center space-x-3">
                    <label className="text-sm font-medium text-gray-700">
                        Actions:
                    </label>
                    <select
                        onChange={(e) => {
                            if (e.target.value) {
                                onAction(e.target.value);
                                e.target.value = '';
                            }
                        }}
                        className="block px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm"
                    >
                        <option value="">Select an action...</option>
                        {actions.map((action) => (
                            <option
                                key={action.value}
                                value={action.value}
                                className={action.dangerous ? 'text-red-600' : ''}
                            >
                                {action.label}
                            </option>
                        ))}
                    </select>
                    <button
                        onClick={() => onAction('go')}
                        className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg font-medium text-sm"
                    >
                        Go
                    </button>
                </div>
            )}
        </div>
    );
}
