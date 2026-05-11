import { FastifyInstance } from 'fastify';
import { BlogPost, Category } from './models';

export default async function blogRoutes(fastify: FastifyInstance) {
  // Public route to list all blog posts
  fastify.get('/api/public/posts', {
    schema: {
        tags: ['Public Blog'],
        description: 'List all published blog posts',
        querystring: {
            type: 'object',
            properties: {
                category: { type: 'string' },
                limit: { type: 'integer', default: 10 },
                offset: { type: 'integer', default: 0 }
            }
        }
    }
  }, async (request) => {
    const { category, limit, offset } = request.query as { category?: string, limit: number, offset: number };
    
    let query = BlogPost.objects.all<BlogPost>()
        .orderBy('createdAt', 'DESC');
    
    // Filtering by category if provided
    if (category) {
        const cat = await Category.objects.get<Category>({ slug: category });
        if (cat) {
            query = query.filter({ categoryId: cat.id as number });
        }
    }
    
    // Filtering only published posts
    const allPosts = (await query.all()).filter((post: any) => post.published);

    // Simple pagination
    const paginatedPosts = allPosts.slice(offset, offset + limit);

    const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
    const postsWithSeo = paginatedPosts.map((p: any) => ({
      ...p,
      seo: {
        canonicalUrl: `${siteUrl}/blog/${p.slug}`,
        ogTitle: p.metaTitle || p.title || '',
        ogDescription: p.metaDescription || p.excerpt || '',
        ogImage: p.featuredImage || '',
        twitterTitle: p.metaTitle || p.title || '',
        twitterDescription: p.metaDescription || p.excerpt || '',
        twitterImage: p.featuredImage || '',
      }
    }));

    return {
        data: postsWithSeo,
        total: allPosts.length
    };
  });

  // Public route to get a single post by slug
  fastify.get('/api/public/posts/:slug', {
    schema: {
        tags: ['Public Blog'],
        description: 'Get a single blog post by slug'
    }
  }, async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const post = await BlogPost.objects.get<BlogPost>({ slug });

    if (!post || !post.published) {
      return reply.code(404).send({ error: 'Post not found' });
    }

    const p = post as any;
    const siteUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
    const ogTitle = p.metaTitle || p.title || '';
    const ogDescription = p.metaDescription || p.excerpt || '';
    const ogImage = p.featuredImage || '';

    return {
      data: {
        ...p,
        seo: {
          canonicalUrl: `${siteUrl}/blog/${p.slug}`,
          ogTitle,
          ogDescription,
          ogImage,
          twitterTitle: ogTitle,
          twitterDescription: ogDescription,
          twitterImage: ogImage,
        }
      }
    };
  });

  // Public route to list all categories
  fastify.get('/api/public/categories', {
    schema: {
        tags: ['Public Blog'],
        description: 'List all blog categories'
    }
  }, async () => {
    const categories = await Category.objects.all<Category>().all();
    return { data: categories };
  });
}
