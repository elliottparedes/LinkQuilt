<div align="center">

<img src="public/logo-mark.svg" alt="LinkQuilt logo" width="96" />

# LinkQuilt

**Your links. Your page. Your corner of the web.**

A free, multi-user link-in-bio platform built for creators, developers, and anyone who wants a customizable home for their links.

**[🌐 Try LinkQuilt](https://linkquilt.com)** · **[🛠 Source code](https://github.com/elliottparedes/LinkQuilt)** · **[🐛 Report an issue](https://github.com/elliottparedes/LinkQuilt/issues)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Self-hostable](https://img.shields.io/badge/Self--hostable-Docker-2496ED?logo=docker)

</div>

---

## What is LinkQuilt?

LinkQuilt helps you collect your links, projects, social profiles, and content in one shareable page.

It started as a fork of [OmniRise/LinkBreeze](https://github.com/OmniRise/LinkBreeze). LinkQuilt builds on that foundation with **multi-user accounts, individual page ownership, permissions, and a hosted experience**. Instead of needing to install a separate app just to make a link page, visitors can use the LinkQuilt service, subject to the instance's registration settings.

The hosted service is intended to be **free to use**. The code is also available for people who prefer to run their own instance.

## ✨ Features

| | |
|---|---|
| **👥 Multi-user accounts** | Separate accounts with owned pages, role-based access, and account administration |
| **🔗 Personal link pages** | Public profiles with custom slugs, social links, sections, link ordering, and optional additional pages |
| **🎨 Themes and customization** | Preset themes, detailed appearance controls, backgrounds, and custom styling |
| **📊 Built-in analytics** | Page views, link clicks, referrers, devices, traffic insights, and date-range reporting |
| **📱 Embeds and sharing** | Rich media embeds, QR codes, social previews, and vCard contact sharing |
| **⏰ Advanced links** | Scheduled links, link thumbnails, custom redirects, and A/B testing |
| **🌐 Custom domains** | Domain-to-page routing, subject to the deployment's DNS and proxy configuration |
| **🔐 Account security** | Password authentication, configurable roles and permissions, TOTP, and optional OIDC single sign-on |
| **📦 Import and export** | Migration tools, data exports, and configurable backups |
| **🛠 Developer tools** | API-key-authenticated REST endpoints with OpenAPI documentation |

Some features depend on the role assigned to an account or on instance-wide settings. Optional integrations, such as wallet passes and external analytics, require additional credentials or configuration.

## 🚀 Get started

### Use the hosted service

1. Visit **[linkquilt.com](https://linkquilt.com)**.
2. Select sign up if registration is enabled. Instance administrators can turn public registration on or off.
3. Create an account and sign in.
4. Customize your page, add links, and share your public URL.

By default, the multi-user application can provision a page for each new account. Administrators may instead configure manual page creation.

### Run your own instance

Build a standalone Docker image with the included Dockerfile and supply `DATABASE_URL`, or run `docker compose up -d --build` with a URL-safe `LINKBREEZE_POSTGRES_PASSWORD` to get the app and a private PostgreSQL instance. Mount `/app/data` persistently.

Use the [Dokploy deployment and SQLite upgrade guide](docs/dokploy.md) to deploy from the Dockerfile or migrate an existing installation.

For local development:

~~~bash
git clone https://github.com/elliottparedes/LinkQuilt.git
cd LinkQuilt
npm ci
cp .env.example .env
# Set DATABASE_URL in .env to your PostgreSQL database.
npm run dev
~~~

Open **http://localhost:3000**. On an uninitialized database, the app redirects to its first-run setup.

**Requirements:** Node.js 22.16 or newer and PostgreSQL. For production, use a persistent data volume and set the public `BASE_URL`.

> **Note:** Some configuration variables, container service names, database file paths, and other internal identifiers retain the original LinkBreeze naming for compatibility. Do not rename them without checking migration and deployment impact.

## 🏗 Architecture

| Layer | Technology |
|---|---|
| Web application | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS, Base UI, drag-and-drop components |
| Persistence | PostgreSQL, Drizzle ORM, local uploads |
| Authentication | Signed sessions, Argon2id password hashing, optional OIDC and TOTP |
| Analytics | Server-side page views and link interactions |
| Containerization | Docker, Docker Compose |
| Production deployment | Dokploy with a persistent Docker volume and HTTPS routing |
| Testing | Vitest and Playwright |

### Multi-user design

LinkQuilt has user accounts and page ownership, rather than treating everyone as a single administrator. Roles determine who can see or manage pages and who can administer accounts or the instance. Administrators can enable or disable signups, create and disable accounts, assign roles, and control whether new users receive pages automatically.

The public page routes and dashboard use page-aware data access, while account-management operations require the appropriate permissions. See the source for the complete implementation and its security boundaries.

### Production storage

Dokploy builds one app container from the Dockerfile and mounts a persistent volume at `/app/data` for uploads, local configuration exports, and the persisted signing key. PostgreSQL stores accounts, pages, configuration, and analytics. The container applies pending schema migrations on startup.

See [Dokploy deployment and backup guidance](docs/dokploy.md) before managing or replacing production volumes.

## 🔌 REST API

LinkQuilt includes a REST API for links, sections, profiles, and analytics. API access uses keys generated within the application's security settings.

On a running instance:

- **/api/v1/docs** — interactive API documentation
- **/api/v1/openapi.json** — OpenAPI specification
- **/api/health** — health endpoint

Send the key with the `Authorization: Bearer` header. The API allows 120 requests per minute per key and reports usage through `X-RateLimit` headers. Reads that return ETags support `If-None-Match`. Mutations are disabled in demo mode and responses use `no-store`. Paginate the links collection with `?cursor`.

| Method | Path | Use |
|---|---|---|
| GET | `/api/v1/links` | List links |
| POST | `/api/v1/links` | Create a link |
| GET | `/api/v1/links/:id` | Read a link |
| PUT | `/api/v1/links/:id` | Edit a link |
| DELETE | `/api/v1/links/:id` | Delete a link |
| PUT | `/api/v1/links/reorder` | Reorder links |
| POST | `/api/v1/links/import` | Import links |
| GET | `/api/v1/sections` | List sections |
| POST | `/api/v1/sections` | Create a section |
| PUT | `/api/v1/sections/reorder` | Reorder sections |
| PUT | `/api/v1/sections/:id` | Edit a section |
| DELETE | `/api/v1/sections/:id` | Delete a section |
| GET | `/api/v1/profile` | Read the profile |
| PUT | `/api/v1/profile` | Edit the profile |
| GET | `/api/v1/analytics` | Read analytics |

## 🧪 Development

~~~bash
npm run lint
npm test
npm run test:e2e
npm run build
~~~

The project includes unit, API-contract, and end-to-end test coverage. These commands are provided for contributors; their presence does not assert that a particular CI run or production release has passed.

Set `TEST_DATABASE_URL` to a disposable PostgreSQL server with a `CREATEDB` role before running Vitest. Each database-backed suite creates and removes its own temporary database.

## 📖 More documentation

- [Dokploy deployment](docs/dokploy.md)
- [Custom domains](docs/custom-domains.md)
- [A/B testing](docs/ab-testing.md)
- [Architecture decisions](docs/adr/)
- [Security](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## 🤝 Origins and license

LinkQuilt is a fork of **[LinkBreeze by OmniRise](https://github.com/OmniRise/LinkBreeze)**. Credit belongs to the original maintainers and contributors for the foundation that made this project possible. LinkQuilt's hosted, multi-user direction and subsequent changes are maintained in this repository.

Distributed under the [MIT License](LICENSE). Review the included license and attribution notices when redistributing.

---

<div align="center">

**[Create your link page at linkquilt.com](https://linkquilt.com)**

</div>
