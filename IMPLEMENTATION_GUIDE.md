# Heals on Wheels - Implementation Guide

## What Has Been Created

### ✅ Foundation & Infrastructure (Completed)

1. **Project Structure**
   - Monorepo setup with npm workspaces
   - Apps: `web` (Next.js), `api` (NestJS), `document-processor` (Python FastAPI)
   - Packages: `types`, `constants`, `validation`
   - Docker Compose for PostgreSQL and Redis
   - Uploads folder for local file storage

2. **Shared Packages**
   - `@heals/types`: Complete TypeScript type definitions (40+ interfaces & enums)
   - `@heals/constants`: Business rules, permissions, SLA thresholds, display names
   - Both packages configured for TypeScript compilation

3. **Database Schema (Prisma)**
   - Complete production-grade schema with 20+ models
   - User authentication & RBAC
   - Patient & Referral management
   - Document handling with AI extraction tracking
   - Clinical review & appointments
   - Notes QA workflow
   - Billing & claims
   - Comprehensive audit trail
   - Notifications & comments
   - All indexes and relations properly defined

4. **Configuration Files**
   - .env.example with all required variables
   - .gitignore optimized for Node.js, Python, Next.js
   - .prettierrc for code formatting
   - docker-compose.yml for local development
   - README.md with architecture and quick start guide

## Next Steps to Complete the System

### Phase 1: Initialize and Verify Foundation

```bash
# 1. Install root dependencies
npm install

# 2. Build shared packages
cd packages/types && npm install && npm run build
cd ../constants && npm install && npm run build
cd ../..

# 3. Start infrastructure
npm run docker:up

# 4. Copy environment file
cp .env.example .env
# Edit .env with your Gemini API key and other settings

# 5. Initialize database
cd apps/api
npm install
npm run prisma:generate
npm run prisma:migrate
npm run db:seed
```

### Phase 2: Backend (NestJS API) - Priority Tasks

The apps/api folder needs to be fully scaffolded. Create the following structure:

```
apps/api/
├── src/
│   ├── main.ts                    # Bootstrap application
│   ├── app.module.ts              # Root module
│   ├── config/                    # Configuration service
│   ├── common/                    # Shared utilities
│   │   ├── decorators/            # Custom decorators
│   │   ├── guards/                # Auth & RBAC guards
│   │   ├── interceptors/          # Logging, transform, error handling
│   │   ├── pipes/                 # Validation pipes
│   │   └── filters/               # Exception filters
│   ├── modules/
│   │   ├── auth/                  # Authentication module
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── strategies/        # JWT strategy
│   │   │   └── dto/
│   │   ├── users/                 # User management
│   │   ├── patients/              # Patient CRUD
│   │   ├── referrals/             # Core referral workflow
│   │   │   ├── referrals.controller.ts
│   │   │   ├── referrals.service.ts
│   │   │   ├── workflow.service.ts # State machine logic
│   │   │   └── dto/
│   │   ├── documents/             # Document upload & extraction
│   │   ├── clinical-review/       # Clinical review workflow
│   │   ├── appointments/          # Scheduling
│   │   ├── encounters/            # Visits & notes
│   │   ├── billing/               # Claims & billing
│   │   ├── audit/                 # Audit logging
│   │   ├── notifications/         # Notification system
│   │   └── websocket/             # Real-time gateway
│   ├── database/
│   │   ├── database.module.ts     # Prisma module
│   │   └── prisma.service.ts      # Prisma client wrapper
│   └── redis/
│       ├── redis.module.ts        # Redis connection
│       └── redis.service.ts       # Pub/sub & caching
├── prisma/
│   ├── schema.prisma              # ✅ Already created
│   ├── migrations/                # Will be generated
│   └── seed.ts                    # Seed script to create
├── test/
│   ├── app.e2e-spec.ts
│   └── jest-e2e.json
├── package.json
├── tsconfig.json
├── nest-cli.json
└── .eslintrc.js
```

**Critical Backend Files to Create:**

1. **apps/api/src/main.ts** - Bootstrap with security, validation, WebSockets
2. **apps/api/src/common/guards/jwt-auth.guard.ts** - JWT verification
3. **apps/api/src/common/guards/rbac.guard.ts** - Role & permission checking
4. **apps/api/src/common/guards/workflow-gate.guard.ts** - State transition validation
5. **apps/api/src/modules/auth/auth.service.ts** - Login, JWT generation, password hashing
6. **apps/api/src/modules/referrals/workflow.service.ts** - State machine engine
7. **apps/api/src/database/prisma.service.ts** - Prisma client with middleware
8. **apps/api/prisma/seed.ts** - Create initial users and test data

### Phase 3: Frontend (Next.js) - Priority Tasks

```
apps/web/
├── app/
│   ├── layout.tsx                 # Root layout with providers
│   ├── page.tsx                   # Landing/redirect
│   ├── login/
│   │   └── page.tsx               # Login form
│   ├── dashboard/
│   │   └── page.tsx               # Role-based dashboard
│   ├── referrals/
│   │   ├── page.tsx               # Kanban board
│   │   ├── [id]/
│   │   │   └── page.tsx           # Referral detail
│   │   └── new/
│   │       └── page.tsx           # Create referral
│   ├── schedule/
│   │   └── page.tsx               # Appointments
│   ├── visits/
│   │   └── page.tsx               # NP visit queue
│   ├── notes-review/
│   │   └── page.tsx               # QA queue
│   └── billing/
│       └── page.tsx               # Billing queue
├── components/
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── AuthGuard.tsx
│   ├── kanban/
│   │   ├── KanbanBoard.tsx
│   │   ├── KanbanColumn.tsx
│   │   └── KanbanCard.tsx
│   ├── referrals/
│   │   ├── ReferralForm.tsx
│   │   ├── ReferralDetail.tsx
│   │   └── DocumentUpload.tsx
│   ├── dashboard/
│   │   ├── MetricCard.tsx
│   │   └── RecentActivity.tsx
│   └── ui/                        # Reusable UI components
│       ├── Button.tsx
│       ├── Input.tsx
│       ├── Card.tsx
│       ├── Modal.tsx
│       └── Table.tsx
├── lib/
│   ├── api-client.ts              # Axios wrapper with auth
│   ├── websocket.ts               # Socket.io client
│   ├── auth.ts                    # Auth utilities
│   └── optimistic-ui.ts           # Optimistic update helpers
├── hooks/
│   ├── useAuth.ts                 # Authentication hook
│   ├── useReferrals.ts            # Referral queries
│   ├── useWebSocket.ts            # Real-time hook
│   └── useOptimistic.ts           # Optimistic updates
├── contexts/
│   ├── AuthContext.tsx            # Auth state
│   └── WebSocketContext.tsx       # WebSocket connection
├── styles/
│   └── globals.css                # Tailwind + custom styles
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

**Critical Frontend Files to Create:**

1. **apps/web/app/layout.tsx** - Root layout with auth provider, WebSocket
2. **apps/web/components/auth/LoginForm.tsx** - Login UI
3. **apps/web/components/kanban/KanbanBoard.tsx** - Drag & drop board
4. **apps/web/lib/api-client.ts** - API wrapper with JWT handling
5. **apps/web/lib/websocket.ts** - Socket.io connection with reconnect
6. **apps/web/hooks/useAuth.ts** - Auth state management
7. **apps/web/tailwind.config.js** - Professional design tokens

### Phase 4: Python Document Processor

```
apps/document-processor/
├── app/
│   ├── main.py                    # FastAPI app
│   ├── routers/
│   │   └── extraction.py          # Extraction endpoints
│   ├── services/
│   │   ├── pdf_extractor.py       # PDF text extraction
│   │   ├── gemini_service.py      # Gemini AI integration
│   │   └── structured_parser.py   # JSON parsing
│   ├── models/
│   │   └── schemas.py             # Pydantic models
│   └── config.py                  # Configuration
├── tests/
│   └── test_extraction.py
├── requirements.txt
└── README.md
```

## Immediate Action Plan

### Day 1: Backend Foundation
1. Initialize NestJS application
2. Create Prisma migrations
3. Implement authentication (login, JWT)
4. Build RBAC guard system
5. Create referral CRUD endpoints
6. Test with Postman/Thunder Client

### Day 2: Workflow Engine
1. Implement state machine service
2. Create workflow transition endpoints
3. Build assignment logic
4. Add audit logging
5. Test all transitions with E2E tests

### Day 3: Frontend Core
1. Initialize Next.js with Tailwind
2. Create login page
3. Build dashboard layout
4. Implement API client with auth
5. Create referral list view

### Day 4: Kanban & Real-time
1. Build Kanban board component
2. Implement drag & drop
3. Add WebSocket gateway in backend
4. Connect WebSocket in frontend
5. Test multi-user sync

### Day 5: Document Processing
1. Create Python FastAPI service
2. Implement Gemini AI integration
3. Build upload endpoint in NestJS
4. Create upload UI component
5. Test extraction flow

### Days 6-10: Complete All Workflows
- Clinical review flow
- Scheduling & appointments
- NP visit & notes
- Notes QA
- Billing & claims

### Days 11-15: Polish & Testing
- Comprehensive E2E tests
- Error handling & validation
- Optimistic UI patterns
- Performance optimization
- Security audit

## Configuration Checklist

Before running:

- [ ] Docker installed and running
- [ ] Node.js 18.17+ installed
- [ ] Python 3.11+ installed
- [ ] Gemini API key obtained
- [ ] PostgreSQL accessible (via Docker)
- [ ] Redis accessible (via Docker)
- [ ] All environment variables set in .env
- [ ] Packages built (`npm run build` in workspace root)

## Testing Strategy

1. **Unit Tests**: All services and utilities
2. **Integration Tests**: API endpoints with test database
3. **E2E Tests**: Complete user journeys (Playwright)
4. **Load Tests**: Concurrent users, workflow transitions
5. **Security Tests**: Auth bypass attempts, SQL injection, XSS

## Deployment Readiness

When ready for production:

1. Set up production PostgreSQL (Railway, Supabase, AWS RDS)
2. Set up production Redis (Railway, Upstash, AWS ElastiCache)
3. Configure environment variables for production
4. Update DATABASE_URL in .env
5. Run migrations on production DB
6. Build all applications (`npm run build`)
7. Deploy:
   - Backend: Railway, Render, AWS
   - Frontend: Vercel, Netlify, AWS
   - Python: Railway, Render, AWS Lambda
8. Configure custom domain and SSL
9. Set up monitoring (Sentry, LogRocket)
10. Enable backup strategy

## Success Criteria

The system is complete when:

- [ ] All 35 tasks from implementation plan are done
- [ ] Users can log in with role-based access
- [ ] Referrals move through all six stages
- [ ] Documents upload and extract with AI
- [ ] Real-time updates work across multiple browsers
- [ ] All state transitions are validated
- [ ] Audit trail captures every action
- [ ] E2E test suite passes with >90% coverage
- [ ] System handles 100+ concurrent users
- [ ] Security audit shows no critical vulnerabilities

## Support & Resources

- **Prisma Docs**: https://www.prisma.io/docs
- **NestJS Docs**: https://docs.nestjs.com
- **Next.js Docs**: https://nextjs.org/docs
- **Gemini AI Docs**: https://ai.google.dev/docs
- **Socket.io Docs**: https://socket.io/docs/v4

## Notes

This is a production-grade system that requires careful implementation of:
- Security (HIPAA compliance)
- Performance (optimistic UI, caching)
- Reliability (error handling, retries)
- Maintainability (clean code, tests)
- Scalability (Redis pub/sub, database indexes)

Do not skip steps or use placeholder code. Each component must be production-ready before moving to the next.

---

**Current Status**: Foundation complete ✅
**Next Task**: Initialize NestJS backend with authentication
