import Link from 'next/link';

interface BreadcrumbItem {
    label: string;
    href?: string;
}

interface BreadcrumbsProps {
    items: BreadcrumbItem[];
}

export default function Breadcrumbs({ items }: BreadcrumbsProps) {
    return (
        <nav className="flex items-center space-x-2 text-sm mb-4">
            <Link
                href="/dashboard"
                className="text-gray-500 hover:text-indigo-600 transition-colors"
            >
                🏠 Home
            </Link>
            {items.map((item, index) => (
                <div key={index} className="flex items-center space-x-2">
                    <span className="text-gray-400">›</span>
                    {item.href ? (
                        <Link
                            href={item.href}
                            className="text-gray-500 hover:text-indigo-600 transition-colors"
                        >
                            {item.label}
                        </Link>
                    ) : (
                        <span className="text-gray-900 font-medium bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                            {item.label}
                        </span>
                    )}
                </div>
            ))}
        </nav>
    );
}
