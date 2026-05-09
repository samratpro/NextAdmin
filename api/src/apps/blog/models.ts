import { Model } from '../../core/model';
import { CharField, TextField, BooleanField, DateTimeField, IntegerField, ForeignKey } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
  appName: 'Blog',
  displayName: 'Categories',
  icon: 'tag',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'name', 'slug'],
  searchFields: ['name', 'slug'],
})
export class Category extends Model {
  static getTableName(): string {
    return 'blog_categories';
  }

  name = new CharField({ maxLength: 100 });
  slug = new CharField({ maxLength: 100, unique: true });
  description = new TextField({ nullable: true });
}

@registerAdmin({
  appName: 'Blog',
  displayName: 'Blog Posts',
  icon: 'file-text',
  permissions: ['view', 'add', 'change', 'delete'],
  listDisplay: ['id', 'title', 'slug', 'published', 'createdAt'],
  searchFields: ['title', 'content', 'excerpt', 'metaTitle', 'metaDescription'],
  filterFields: ['published'],
  relatedFields: {
    categoryId: 'Category',
    authorId: 'User'
  }
})
export class BlogPost extends Model {
  static getTableName(): string {
    return 'blog_posts';
  }

  title = new CharField({ maxLength: 255 });
  slug = new CharField({ maxLength: 255, unique: true });
  excerpt = new TextField({ nullable: true });
  content = new TextField(); // Stores Editor.js JSON
  featuredImage = new CharField({ maxLength: 500, nullable: true });
  
  metaTitle = new CharField({ maxLength: 60, nullable: true });
  metaDescription = new CharField({ maxLength: 160, nullable: true });

  categoryId = new IntegerField({ nullable: true });
  authorId = new IntegerField({ nullable: true });
  
  published = new BooleanField({ default: false });
  publishedAt = new DateTimeField({ nullable: true });
  
  createdAt = new DateTimeField({ default: () => new Date().toISOString() });
  updatedAt = new DateTimeField({ default: () => new Date().toISOString() });
}
