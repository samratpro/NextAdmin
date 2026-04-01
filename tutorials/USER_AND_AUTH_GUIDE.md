# User and Authentication Guide

This guide explains how to work with users, roles, and protected routes in Nango.

The key design rule is simple:

Keep the built-in `User` model focused on authentication and account state. Put domain-specific user data in separate profile models or group membership.

That keeps auth reusable and avoids turning the core user table into an application-specific dumping ground.

## Core Rule: Do Not Overload the User Model

If your app has roles such as:

- teacher and student
- vendor and customer
- author and editor

do not keep adding unrelated business fields to the base `User` model.

Instead:

- use profile models when a role needs extra data
- use groups and permissions when a role is mainly about access control

## Option 1: Profile Models

Use profiles when different user types need different domain data.

Example:

- teachers need `department` and `employeeId`
- students need `major` and `grade`

### Example Models

```typescript
import { Model } from '../../core/model';
import { CharField, IntegerField, ForeignKey } from '../../core/fields';
import { registerAdmin } from '../../core/adminRegistry';

@registerAdmin({
  appName: 'School',
  displayName: 'Teachers',
  listDisplay: ['id', 'user', 'department']
})
export class Teacher extends Model {
  static getTableName(): string {
    return 'teachers';
  }

  user = new ForeignKey('User', { unique: true, onDelete: 'CASCADE' });
  department = new CharField({ maxLength: 100 });
  employeeId = new CharField({ maxLength: 20 });
}

@registerAdmin({
  appName: 'School',
  displayName: 'Students',
  listDisplay: ['id', 'user', 'grade']
})
export class Student extends Model {
  static getTableName(): string {
    return 'students';
  }

  user = new ForeignKey('User', { unique: true, onDelete: 'CASCADE' });
  grade = new IntegerField();
  major = new CharField({ maxLength: 100 });
}
```

## Option 2: Groups and Permissions

Use groups when the distinction is mostly about access control and not extra profile data.

Examples:

- vendor
- customer support
- billing staff
- moderator

This is the lighter option when you only need role checks.

## Protecting Routes

For route protection, use middleware that builds on the core auth layer.

### Teacher-Only Middleware

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { Teacher } from './models';
import { requireAuth } from '../../middleware/auth';

export async function requireTeacher(request: FastifyRequest, reply: FastifyReply) {
  await requireAuth(request, reply);

  const teacherProfile = Teacher.objects.get({ userId: request.user!.id });
  if (!teacherProfile) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'Teacher access required'
    });
  }

  (request as any).teacher = teacherProfile;
}
```

### Applying the Middleware

```typescript
fastify.post('/api/courses', {
  preHandler: requireTeacher
}, async (request) => {
  const teacher = (request as any).teacher;
  return { message: `Course created by ${teacher.department}` };
});
```

## Typical Auth Flow

The default auth flow looks like this:

1. register a user account
2. send an email verification token
3. verify the account
4. log in and receive JWT tokens
5. protect routes with auth middleware

For profile-based applications, you usually add one more step:

6. create the role-specific profile after registration or during onboarding

## Example Onboarding Endpoint

```typescript
fastify.post('/api/vendor/onboarding', {
  preHandler: requireAuth
}, async (request, reply) => {
  const existing = Vendor.objects.get({ userId: request.user!.id });
  if (existing) {
    return reply.code(400).send({ error: 'Vendor profile already exists' });
  }

  Vendor.objects.create({
    userId: request.user!.id,
    companyName: request.body.companyName,
    taxId: request.body.taxId
  });

  return { success: true };
});
```

## Frontend Integration

The admin app already talks to the backend API, but your own public frontend will usually need:

- login state
- token storage
- route or page guards
- optional profile lookup

If role information is stored in profile tables, your frontend often needs one extra request after login to determine what kind of user is signed in.

## Swagger and Auth

Swagger is available at:

- `http://localhost:8000/docs`

Use route `schema` objects to document protected endpoints clearly.

Example:

```typescript
fastify.post('/api/courses', {
  preHandler: requireTeacher,
  schema: {
    tags: ['Courses'],
    summary: 'Create a course',
    security: [{ bearerAuth: [] }],
    body: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
        description: { type: 'string' }
      }
    }
  }
}, async () => {
  return { success: true };
});
```

## Recommendations

Use this decision rule:

- use the base `User` model for identity and auth concerns
- use profiles for domain-specific data
- use groups for lightweight role checks
- keep route protection explicit in middleware

That approach matches the framework's broader engineering philosophy: clear boundaries, fewer hidden dependencies, and less coupling between account logic and application logic.
