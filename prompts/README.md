# 🚀 NextAdmin AI Vibe Coding Prompt Catalog

Welcome to the **NextAdmin AI Prompt Catalog**! These prompts are optimized specifically for **Vibe Coding**—allowing you to feed high-fidelity templates to AI coding assistants (like Gemini, Claude, or GPT) to instantly generate, customize, build, and deploy full features, dynamic UI interfaces, and complete public frontends.

---

## 📂 Prompt Templates Index

Choose the prompt that matches your current goal, copy the content, fill out the dynamic bracket variables `[LIKE_THIS]`, and paste it into your AI assistant.

| Prompt File | Purpose / Use Case | Focus Areas |
| :--- | :--- | :--- |
| **[01_CREATE_CUSTOM_MODEL.md](./01_CREATE_CUSTOM_MODEL.md)** | Create a new backend App, custom ORM Model, and register it to the Admin UI. | Dynamic fields, `@registerAdmin`, migrations |
| **[02_BUILD_FRONTEND_APP.md](./02_BUILD_FRONTEND_APP.md)** | Generate a beautiful, high-aesthetic public frontend (Next.js/React) consuming the API. | API queries, auth-token headers, grid lists |
| **[03_CUSTOMIZE_DASHBOARD_PANEL.md](./03_CUSTOMIZE_DASHBOARD_PANEL.md)** | Add custom dashboard cards, charts, analytics, and metrics into the Admin Console. | KPI panels, charts integration, page overrides |
| **[04_PRODUCTION_READY_DEPLOYMENT.md](./04_PRODUCTION_READY_DEPLOYMENT.md)** | Deploy the entire stack to a VPS using Docker, Nginx, Nginx Proxy Cache, and CLI verification. | Docker Compose, SSL, `.env` config, Nginx |

---

## 💡 How to Get the Best Results (Vibe Coding Principles)

When vibe-coding NextAdmin features with an AI assistant, remember these principles:

1. **Mention the Decoupled Architecture**: Always remind the AI that `api/` is a Fastify backend with its own custom lightweight ORM and that `admin/` is a separate Next.js app on port `7000`.
2. **Auto-Discovery Hooks**: Remind the AI that NextAdmin does *not* use Prisma or manual router registrations. Simply decorating a model class with `@registerAdmin` and placing files inside `api/src/apps/<appName>/` is enough.
3. **API Security Standards**: The API automatically strips password hashes and returns blank strings (`""`). The admin UI uses `"Leave blank to keep current"` for editing inputs.
4. **Windowing and Nodes**: Ensure the AI uses Node `20.x` LTS standards to avoid C++ build errors with `better-sqlite3`.

---

Let's vibe code! Select a prompt above to get started.
