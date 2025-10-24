# Repository Structure Map

## Directory Tree
```
.
├── src/                         # React front-end source
│   ├── app/                     # Application shell, layout, routing
│   │   └── routes.tsx           # Browser router wiring layout to feature pages
│   ├── components/              # Reusable presentation components
│   ├── domains/                 # Feature modules grouped by business domain
│   │   ├── home/                # Landing and dashboard domain widgets
│   │   ├── procurement/         # Purchase order and vendor interactions
│   │   └── settings/            # Configuration and preferences UI
│   ├── services/                # HTTP clients and domain-specific service helpers
│   ├── hooks/                   # Shared React hooks
│   ├── lib/                     # Utilities and foundational helpers
│   └── mocks/                   # Mock data for UI states
├── server/                      # Fastify + Prisma API server
│   ├── prisma/                  # Database schema and migrations
│   │   └── schema.prisma        # Data model definitions and relations
│   └── src/                     # Server-side application code
│       ├── routes/              # REST endpoints split per business capability
│       ├── plugins/             # Fastify plugins (auth, cors, etc.)
│       └── utils/               # Shared helpers for route handlers
├── tests/                       # Automated test suites
│   ├── e2e/                     # Playwright end-to-end flows
│   └── unit/                    # Vitest-based unit tests
├── docs/                        # Project documentation
└── utils/                       # Root-level shared tooling scripts
```

## Key File & Directory Roles
- `src/app/routes.tsx`: Central React Router configuration linking layout to domain pages.
- `src/domains/**`: Feature-specific UI bundles (pages, components, state) aligned to business areas.
- `src/services/**`: REST client wrappers and adapters used by UI hooks and components.
- `server/prisma/schema.prisma`: Prisma schema defining the warehouse and sales data models.
- `server/src/routes/*.ts`: Fastify route handlers responsible for domain APIs (sales, packages, etc.).
- `tests/**`: Unit and end-to-end tests validating UI hooks, services, and flows.

## Planned Modification Targets
**Frontend**
- `src/app/routes.tsx`: Update navigation structure per 개선안.pdf requirements.
- `src/services/**`: Adjust API contracts and data fetching logic to match backend updates.

**Backend**
- `server/prisma/schema.prisma`: Reflect schema changes for new procurement and sales metrics.
- `server/src/routes/*.ts`: Implement revised endpoints and validation rules.

**Testing**
- `tests/e2e/`: Expand coverage for new user journeys.
- `tests/unit/`: Add cases for updated hooks and service utilities.
