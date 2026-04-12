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
    
    return { 
        data: paginatedPosts,
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

    return { data: post };
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
