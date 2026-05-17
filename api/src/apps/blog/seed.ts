import { Category, BlogPost } from './models';
import { User } from '../auth/models';
import logger from '../../core/logger';

export default async function seedBlog() {
  logger.info('Checking if Blog app needs seeding...');

  const categoryCount = await Category.objects.count();

  if (categoryCount > 0) {
    logger.info('Blog app already has categories, skipping seeding.');
    return;
  }

  logger.info('Seeding sample blog data for developer help...');

  // 2. Create Categories
  const tech = new Category() as any;
  tech.name = 'Technology';
  tech.slug = 'technology';
  tech.description = 'All the latest updates, tutorials, and insights from the tech industry.';
  await tech.save();

  const lifestyle = new Category() as any;
  lifestyle.name = 'Lifestyle';
  lifestyle.slug = 'lifestyle';
  lifestyle.description = 'Articles and guides covering productivity, health, and standard life tips.';
  await lifestyle.save();

  console.log('✓ Seeding Categories: Technology, Lifestyle');

  // 3. Find a default author (superuser or staff)
  const users = await User.objects.all<User>().all();
  const author = users.find(u => (u as any).isSuperuser || (u as any).isStaff) || users[0];
  const authorId = author ? (author.id as number) : 1;

  // 4. Create sample blog posts
  const post1 = new BlogPost() as any;
  post1.title = 'Getting Started with NextAdmin';
  post1.slug = 'getting-started-with-nextadmin';
  post1.excerpt = 'Learn how to build premium modular web applications with NextAdmin framework.';
  post1.content = JSON.stringify({
    time: Date.now(),
    blocks: [
      {
        id: 'header1',
        type: 'header',
        data: {
          text: 'Welcome to NextAdmin',
          level: 2
        }
      },
      {
        id: 'p1',
        type: 'paragraph',
        data: {
          text: 'NextAdmin is a premium, developer-friendly backend and admin panel framework designed to be highly plug-and-play. With its automatic app-discovery module, you can easily manage models, routes, and middleware without editing core framework files.'
        }
      },
      {
        id: 'p2',
        type: 'paragraph',
        data: {
          text: 'This blog post is a live demonstration of NextAdmin capabilities. You can edit this entire article, change its meta tags, assign it to different categories, or even toggle its publication status dynamically from the admin panel!'
        }
      }
    ],
    version: '2.28.0'
  });
  post1.featuredImage = '';
  post1.metaTitle = 'Getting Started with NextAdmin Framework | Dev Guide';
  post1.metaDescription = 'Build modular, decoupled applications easily with the NextAdmin auto-discovery engine. Read our developer guide.';
  post1.categoryId = tech.id as number;
  post1.authorId = authorId;
  post1.published = true;
  post1.publishedAt = new Date().toISOString();
  await post1.save();

  const post2 = new BlogPost() as any;
  post2.title = 'The Art of Clean Coding';
  post2.slug = 'the-art-of-clean-coding';
  post2.excerpt = 'How to write robust, maintainable, and modular code that developers love to work with.';
  post2.content = JSON.stringify({
    time: Date.now(),
    blocks: [
      {
        id: 'header1',
        type: 'header',
        data: {
          text: 'Writing Beautiful Code',
          level: 2
        }
      },
      {
        id: 'p1',
        type: 'paragraph',
        data: {
          text: 'Clean code is simple, direct, and reads like well-written prose. It never obscures the designer\'s intent, but rather is full of clean abstractions and straightforward lines of control.'
        }
      }
    ],
    version: '2.28.0'
  });
  post2.featuredImage = '';
  post2.metaTitle = 'The Art of Clean Coding: Best Practices';
  post2.metaDescription = 'Discover key strategies to write cleaner, more maintainable code with NextAdmin module standards.';
  post2.categoryId = lifestyle.id as number;
  post2.authorId = authorId;
  post2.published = true;
  post2.publishedAt = new Date().toISOString();
  await post2.save();

  logger.info('✓ Seeding Blog Posts: Getting Started with NextAdmin, The Art of Clean Coding');
  console.log('✓ Seeding Blog Posts completed successfully!');
}
