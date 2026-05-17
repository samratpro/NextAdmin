# Removing the Built-in Blog Feature

NextAdmin comes with a simple Blog system (**Categories** and **Blog Posts**) by default to help you get started quickly. If you don't need this feature, you can remove it in a few simple steps.

## Step 1: Delete the Blog App directory
Delete the entire `api/src/apps/blog` directory to completely remove the logic. Because NextAdmin uses an Auto-Discovery Engine, simply deleting the folder is enough to unregister all models and routes.

```bash
# Example command
rm -rf api/src/apps/blog
```

## Step 2: Remove Database Tables (Optional)
If you have already started the server once, the tables `blog_categories` and `blog_posts` will have been created in your database. You can manually drop these tables using your database client.

```sql
DROP TABLE blog_posts;
DROP TABLE blog_categories;
```

## Step 3: Verification
Restart your API server. The Blog models should no longer appear in the Admin Dashboard, and any blog-related endpoints will no longer be available.

> [!NOTE]
> If you have custom permission groups that were linked to Blog permissions, you may want to clean those up in the Admin Dashboard under "Groups".
