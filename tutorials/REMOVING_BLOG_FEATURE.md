# Removing the Built-in Blog Feature

Nango comes with a simple Blog system (**Categories** and **Blog Posts**) by default to help you get started quickly. If you don't need this feature, you can remove it in a few simple steps.

## Step 1: Remove API registration
Open [api/src/index.ts](file:///c:/Users/samra/Desktop/My%20Dev/nango/api/src/index.ts) and remove the following sections:

### 1. Remove Imports (Lines ~36-37)
```typescript
// Remove these
import blogRoutes from './apps/blog/routes';
import { Category, BlogPost } from './apps/blog/models';
```

### 2. Remove Table Creation (Line ~63)
Modify the loop in `initializeDatabase` to remove `Category` and `BlogPost`:
```typescript
// Before
for (const model of [...coreModels, Category, BlogPost]) {
  await model.createTable();
}

// After
for (const model of coreModels) {
  await model.createTable();
}
```

### 3. Remove Route Registration (Line ~165)
```typescript
// Remove this line
await fastify.register(blogRoutes);
```

## Step 2: Delete the Blog App directory
Delete the entire `api/src/apps/blog` directory to completely remove the logic.

```bash
# Example command
rm -rf api/src/apps/blog
```

## Step 3: Remove Database Tables (Optional)
If you have already started the server once, the tables `blog_categories` and `blog_posts` will have been created in your database. You can manually drop these tables using your database client.

```sql
DROP TABLE blog_posts;
DROP TABLE blog_categories;
```

## Step 4: Verification
Restart your API server. The Blog models should no longer appear in the Admin Dashboard, and any blog-related endpoints will no longer be available.

> [!NOTE]
> If you have custom permission groups that were linked to Blog permissions, you may want to clean those up in the Admin Dashboard under "Groups".
