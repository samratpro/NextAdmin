import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().max(200).optional(),
  orderBy: z.string().max(50).optional(),
  orderDirection: z.enum(['ASC', 'DESC']).optional(),
});

export const modelNameParamSchema = z.object({
  modelName: z.string().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Invalid model name'),
});

export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const createUserSchema = z.object({
  username: z.string().min(3).max(150),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().max(150).optional(),
  lastName: z.string().max(150).optional(),
  isActive: z.boolean().optional(),
  isStaff: z.boolean().optional(),
  isSuperuser: z.boolean().optional(),
});

export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .extend({ password: z.string().min(8).optional() });

export const updateGroupIdsSchema = z.object({
  groupIds: z.array(z.number().int().positive()),
});

export const updatePermissionIdsSchema = z.object({
  permissionIds: z.array(z.number().int().positive()),
});

export function parseOrReply(schema: z.ZodTypeAny, data: unknown): { success: true; data: any } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}
