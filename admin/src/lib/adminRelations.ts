export interface RelationLabelRecord {
    id?: string | number | null;
    name?: string | null;
    title?: string | null;
    username?: string | null;
    displayName?: string | null;
    clientName?: string | null;
    mainTopicName?: string | null;
    slug?: string | null;
    websiteUrl?: string | null;
    email?: string | null;
    url?: string | null;
    [key: string]: unknown;
}

const RELATION_LABEL_FIELDS = [
    'name',
    'title',
    'username',
    'displayName',
    'clientName',
    'mainTopicName',
    'slug',
    'websiteUrl',
    'email',
    'url'
] as const;

export function resolveRelatedModel(
    fieldName: string,
    fieldRelatedModel?: string,
    relatedFields?: Record<string, string>
): string | undefined {
    return relatedFields?.[fieldName] || fieldRelatedModel;
}

export function getRelationDisplayLabel(
    option: RelationLabelRecord | null | undefined,
    relatedModel: string,
    fieldNameOrFallbackId?: string | number | null,
    fallbackId?: string | number | null
): string {
    const fieldName = typeof fieldNameOrFallbackId === 'string' ? fieldNameOrFallbackId : undefined;
    const optionId = option?.id ?? (typeof fieldNameOrFallbackId === 'string' ? fallbackId : fieldNameOrFallbackId);

    if (option) {
        if (fieldName === 'userId') {
            const value = option.email || option.username;
            if (typeof value === 'string' && value.trim()) {
                return value;
            }
        }

        if (fieldName === 'appId') {
            const value = option.name || option.slug;
            if (typeof value === 'string' && value.trim()) {
                return value;
            }
        }

        for (const labelField of RELATION_LABEL_FIELDS) {
            const value = option[labelField];
            if (typeof value === 'string' && value.trim()) {
                return value;
            }
        }
    }

    return `${relatedModel} #${optionId ?? 'Unknown'}`;
}

export function findRelatedOptionById<T extends RelationLabelRecord>(
    options: T[],
    value: string | number | null | undefined
): T | undefined {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }

    return options.find((opt) => String(opt.id) === String(value));
}
