import {
    findRelatedOptionById,
    getRelationDisplayLabel,
    resolveRelatedModel
} from '@/lib/adminRelations';

describe('adminRelations', () => {
    it('prefers admin-configured relatedFields before field metadata', () => {
        expect(resolveRelatedModel('userId', 'User', { userId: 'AccountUser' })).toBe('AccountUser');
        expect(resolveRelatedModel('userId', 'User')).toBe('User');
    });

    it('uses the requested label priority order', () => {
        expect(
            getRelationDisplayLabel(
                {
                    id: 10,
                    username: 'alice',
                    displayName: 'Alice A.',
                    email: 'alice@example.com'
                },
                'User'
            )
        ).toBe('alice');

        expect(
            getRelationDisplayLabel(
                {
                    id: 20,
                    websiteUrl: 'https://example.com',
                    email: 'owner@example.com'
                },
                'Site'
            )
        ).toBe('https://example.com');
    });

    it('falls back to the related model and id when no label fields exist', () => {
        expect(getRelationDisplayLabel({ id: 42 }, 'Project')).toBe('Project #42');
        expect(getRelationDisplayLabel(undefined, 'Project', 42)).toBe('Project #42');
    });

    it('matches related options even when ids differ by string vs number', () => {
        const related = [{ id: 7, username: 'sam' }, { id: '8', username: 'alex' }];

        expect(findRelatedOptionById(related, '7')).toEqual({ id: 7, username: 'sam' });
        expect(findRelatedOptionById(related, 8)).toEqual({ id: '8', username: 'alex' });
    });
});
