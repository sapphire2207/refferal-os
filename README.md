# Heals on Wheels - Referral Workflow & Patient Pipeline Portal

A production-grade, HIPAA-compliant healthcare referral workflow management system that manages the complete lifecycle from referral intake through billing submission.

## 🏗️ Architecture

### Tech Stack
- **Frontend**: Next.js 14+ (App Router) with TypeScript
- **Backend**: NestJS with TypeScript
- **Document Processing**: Python FastAPI with Gemini AI
- **Database**: PostgreSQL with Prisma ORM
- **Cache/PubSub**: Redis for real-time updates
- **Real-time**: WebSockets (Socket.io) + Redis Pub/Sub
- **Authentication**: Custom JWT-based auth
- **Testing**: Jest, Playwright for E2E

### System Components
```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (Next.js)                         │
│  Role-based dashboards • Real-time Kanban • Optimistic UI   │
└─────────────────┬───────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────┐
│              API Gateway (NestJS)                            │
│  Authentication • Authorization • WebSockets • Rate Limiting │
└─────┬───────────────┬───────────────┬──────────────────────┘
      │               │               │
      ▼               ▼               ▼
┌──────────┐   ┌─────────────┐   ┌──────────────────┐
│ Workflow │   │  Document   │   │ Python Service   │
│ Service  │   │  Service    │   │ Gemini AI + OCR  │
└────┬─────┘   └──────┬──────┘   └────────┬─────────┘
     │                │                    │
     └────────────────┴────────────────────┘
                      │
        ┌─────────────▼──────────────┐
        │  PostgreSQL + Redis        │
        └────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18.17+ and npm 9+
- Python 3.11+
- PostgreSQL 14+ (installed and running)
- Redis 7+ (installed and running)

### Installation

1. **Clone and install dependencies**
```bash
npm install
```

2. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your PostgreSQL URL and Redis connection
```

3. **Set up database**
```bash
npm run prisma:migrate
npm run db:seed
```

4. **Start all services**
```bash
npm run dev
```

Services will be available at:
- **Web App**: http://localhost:3000
- **API**: http://localhost:3001
- **Document Processor**: http://localhost:8000
- **Prisma Studio**: Run `npm run prisma:studio`

## 📋 Workflow Stages

The system manages six operational stages:

1. **Referral Intake** - Document upload, eligibility verification
2. **Clinical Review** - Clinical appropriateness assessment
3. **Scheduling** - Appointment scheduling and NP assignment
4. **NP Visit** - Visit documentation and clinical notes
5. **Notes QA** - Clinical documentation review and approval
6. **Billing** - Claim submission and billing workflow

## 🔐 Security & Compliance

- **HIPAA-Ready**: Audit trails, access controls, encryption
- **Role-Based Access Control**: 7 roles with granular permissions
- **Authentication**: JWT-based with secure password hashing
- **Authorization**: Multi-layer permission checks (role, scope, workflow state)
- **Audit Logging**: Complete activity tracking with before/after states
- **Session Management**: Timeout, revocation, and renewal

## 🎯 Key Features

- ✅ Multi-dimensional state tracking (pipeline_stage, work_status, billing_status, case_outcome)
- ✅ AI-powered document extraction with Gemini
- ✅ Real-time collaboration with WebSocket sync
- ✅ Optimistic UI for instant feedback
- ✅ Server-validated workflow transitions
- ✅ Role-specific dashboards and queues
- ✅ Comprehensive audit trail
- ✅ Document upload and verification workflow
- ✅ Assignment and task management
- ✅ Exception handling and holds

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run E2E tests
npm run test:e2e

# Run tests for specific workspace
npm run test -w apps/api
```

## 📦 Project Structure

```
heals-on-wheels/
├── apps/
│   ├── web/              # Next.js frontend
│   ├── api/              # NestJS backend
│   └── document-processor/ # Python AI service
├── packages/
│   ├── types/            # Shared TypeScript types
│   ├── validation/       # Shared validation schemas
│   └── constants/        # Shared constants and enums
├── docker-compose.yml    # Local development services
└── package.json          # Workspace root
```

## 🛠️ Development

### Available Scripts

```bash
npm run dev              # Start all services in dev mode
npm run dev:web          # Start Next.js only
npm run dev:api          # Start NestJS only
npm run build            # Build all apps
npm run lint             # Lint all code
npm run format           # Format code with Prettier
npm run prisma:studio    # Open Prisma Studio
npm run db:reset         # Reset database with seed data
```

### Code Quality

- TypeScript strict mode enabled
- ESLint for code quality
- Prettier for formatting
- Husky for pre-commit hooks
- Comprehensive test coverage

## 📚 Documentation

- [API Documentation](./apps/api/README.md)
- [Database Schema](./apps/api/prisma/schema.prisma)
- [Workflow State Machine](./docs/workflow-state-machine.md)
- [Role Permissions](./docs/role-permissions.md)
- [Deployment Guide](./docs/deployment.md)

## 🤝 Contributing

This is a production system with strict code quality requirements:
- All code must be TypeScript with proper types
- All features must include unit and E2E tests
- All API endpoints must be documented
- All database changes must include migrations
- Security and HIPAA compliance are non-negotiable

## 📄 License

Proprietary - All rights reserved

## 🔧 Troubleshooting

### Database Connection Issues
```bash
# Reset Docker volumes
npm run docker:down
docker volume rm heals-on-wheels_postgres_data
npm run docker:up
npm run prisma:migrate
```

### Port Already in Use
Update port numbers in `.env` file and restart services.

### Redis Connection Failed
Ensure Docker is running: `docker ps`

---

Built with ❤️ for healthcare professionals managing referral workflows.
