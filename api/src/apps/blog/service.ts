import { BlogPost } from './models';

export class BlogPostService {
    async list() {
        return await BlogPost.objects.all<BlogPost>()
            .orderBy('id', 'DESC')
            .all();
    }

    async getById(id: number) {
        return await BlogPost.objects.get<BlogPost>({ id });
    }

    async create(data: Partial<BlogPost>) {
        return await BlogPost.objects.create<BlogPost>(data);
    }
}

export default new BlogPostService();
