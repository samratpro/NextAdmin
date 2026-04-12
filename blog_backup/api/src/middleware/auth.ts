import { FastifyRequest, FastifyReply } from 'fastify';
import authService, { TokenPayload } from '../apps/auth/service';
import { User } from '../apps/auth/models';

declare module 'fastify' {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Prefer httpOnly cookie, fall back to Authorization header for non-browser clients
    const tokenFromCookie = (request as any).cookies?.accessToken as string | undefined;
    const authHeader = request.headers.authorization;
    const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const token = tokenFromCookie || tokenFromHeader;

    if (!token) {
      reply.code(401).send({ error: 'No token provided' });
      return;
    }

    const user = authService.verifyToken(token);

    if (!user) {
      reply.code(401).send({ error: 'Invalid token' });
      return;
    }

    request.user = user;
  } catch (error) {
    reply.code(401).send({ error: 'Invalid token' });
  }
}

export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    const tokenFromCookie = (request as any).cookies?.accessToken as string | undefined;
    const authHeader = request.headers.authorization;
    const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;
    const token = tokenFromCookie || tokenFromHeader;

    if (!token) return;

    const user = authService.verifyToken(token);
    if (user) {
      request.user = user;
    }
  } catch {
    // No-op: unauthenticated requests are allowed
  }
}

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await authenticate(request, reply);

  if (!request.user) {
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }
}

export async function requireStaff(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);

  if (!request.user?.isStaff && !request.user?.isSuperuser) {
    reply.code(403).send({ error: 'Staff access required' });
    return;
  }
}

export async function requireSuperuser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await requireAuth(request, reply);

  if (!request.user?.isSuperuser) {
    reply.code(403).send({ error: 'Superuser access required' });
    return;
  }
}

export async function requireBasicAuthSuperuser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    reply.header('WWW-Authenticate', 'Basic realm="Admin Access"');
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }

  try {
    const base64 = authHeader.substring(6);
    const credentials = Buffer.from(base64, 'base64').toString('ascii');

    // Handle passwords with colons
    const colonIndex = credentials.indexOf(':');
    if (colonIndex === -1) {
      throw new Error('Invalid format');
    }

    const username = credentials.substring(0, colonIndex);
    const password = credentials.substring(colonIndex + 1);

    if (!username || !password) {
      throw new Error('Invalid format');
    }

    const user = await User.objects.get<User>({ username });
    if (!user) {
      reply.header('WWW-Authenticate', 'Basic realm="Admin Access"');
      reply.code(401).send({ error: 'Invalid credentials' });
      return;
    }

    const isValid = await user.checkPassword(password);
    if (!isValid) {
      reply.header('WWW-Authenticate', 'Basic realm="Admin Access"');
      reply.code(401).send({ error: 'Invalid credentials' });
      return;
    }

    if (!user.isSuperuser) {
      reply.code(403).send({ error: 'Superuser required' });
      return;
    }

    // Attach user to request
    request.user = {
      userId: user.id!,
      email: (user as any).email,
      username: (user as any).username,
      isStaff: (user as any).isStaff,
      isSuperuser: (user as any).isSuperuser,
      needsPasswordReset: !!(user as any).needsPasswordReset,
    };

  } catch (e) {
    reply.header('WWW-Authenticate', 'Basic realm="Admin Access"');
    reply.code(401).send({ error: 'Authentication required' });
    return;
  }
}
