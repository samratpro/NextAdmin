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
    fallbackId?: string | number | null
): string {
    const optionId = option?.id ?? fallbackId;

    if (option) {
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
