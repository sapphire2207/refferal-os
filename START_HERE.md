# 🚀 START HERE - Heals on Wheels Setup Guide

## What Has Been Built

✅ **Complete Foundation** - Project structure, shared types, database schema
✅ **Authentication System** - JWT, sessions, RBAC with Redis caching  
✅ **Database Layer** - Prisma with 20+ production-ready models
✅ **Redis Integration** - Caching, pub/sub, session management
✅ **Security** - Password hashing, guards, decorators, role-based access

## Quick Start (5 Minutes)

### Prerequisites

Make sure you have installed:
- Node.js 18.17+ 
- PostgreSQL 14+ (running on localhost or remote)
- Redis 7+ (running on localhost or remote)
- Python 3.11+ (for document processor later)

### Step 1: Install Dependencies

```bash
# Install root dependencies
npm install

# Build shared packages
cd packages/types && npm install && npm run build
cd ../constants && npm install && npm run build
cd ../..

# Install API dependencies
cd apps/api
npm install
```

### Step 2: Configure Environment

```bash
# Copy environment template
cp .env.example .env
```

**Edit `.env` file** with your actual connections:

```env
# Your PostgreSQL connection
DATABASE_URL="postgresql://your_user:your_password@localhost:5432/heals_db"

# Your Redis connection
REDIS_HOST="localhost"
REDIS_PORT="6379"
REDIS_PASSWORD=""  # If you have one

# Generate a secure JWT secret (or use: openssl rand -base64 32)
JWT_SECRET="your-super-secure-random-string-min-32-chars"

# Your Gemini AI key
GEMINI_API_KEY="your-gemini-api-key"

# Port configuration
API_PORT="3001"
```

### Step 3: Setup Database

```bash
# Generate Prisma Client
npx prisma generate

# Create database and run migrations
npx prisma migrate dev --name init

# Seed with test data
npm run db:seed
```

You should see:
```
✅ Users created
✅ Roles assigned
✅ Scopes assigned
✅ Patients created
✅ Referrals created
✅ Workflow history created

🎉 Database seeded successfully!
```

### Step 4: Start the API

```bash
npm run dev
```

You should see:
```
✅ Database connected successfully
✅ Redis connected successfully
🚀 API is running on: http://localhost:3001/api/v1
📊 Health check: http://localhost:3001/api/v1/health
```

### Step 5: Test It Works

**Health Check**
```bash
curl http://localhost:3001/api/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-10-26T...",
  "services": {
    "database": "up",
    "redis": "up"
  }
}
```

**Login Test**

Use Postman, Thunder Client, or curl:

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@heals.health","password":"Admin@2024!"}'
```

Expected response:
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "admin@heals.health",
    "firstName": "System",
    "lastName": "Administrator",
    "roles": ["ADMIN"]
  }
}
```

**Get Current User**

```bash
curl http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"
```

## Test User Accounts

All passwords are: `Admin@2024!`

| Email | Role | Purpose |
|-------|------|---------|
| admin@heals.health | Administrator | Full system access |
| intake@heals.health | Intake Specialist | Process new referrals |
| reviewer@heals.health | Clinical Reviewer | Review clinical appropriateness |
| scheduler@heals.health | Scheduler | Schedule appointments |
| np@heals.health | Nurse Practitioner | Conduct visits, write notes |
| billing@heals.health | Billing Coordinator | Submit claims |

## What's Working Right Now

✅ User authentication (login, logout, refresh token)
✅ JWT-based authorization
✅ Role-based access control
✅ Session management with Redis
✅ Database with complete schema
✅ Health check endpoint
✅ Permission caching
✅ Audit-ready structure

## What's Next to Build

The system is ready for you to build the core modules. Check **BUILD_STATUS.md** for detailed progress.

**Priority Order:**

1. **Referrals Module** - Core workflow engine with state machine
2. **WebSocket Gateway** - Real-time updates
3. **Patients Module** - Patient CRUD
4. **Documents Module** - File upload & AI extraction
5. **Next.js Frontend** - Login, dashboard, Kanban board

## Project Structure

```
ReferralSystem/
├── apps/
│   ├── api/              # ✅ NestJS backend (80% complete)
│   ├── web/              # ⏳ Next.js frontend (to build)
│   └── document-processor/  # ⏳ Python AI service (to build)
├── packages/
│   ├── types/            # ✅ Complete TypeScript types
│   └── constants/        # ✅ Complete business rules
├── uploads/              # Local file storage
└── .env                  # Your configuration
```

## Useful Commands

```bash
# Development
npm run dev                    # Start API in watch mode
npm run build                  # Build for production
npm run start                  # Start production build

# Database
npm run prisma:studio          # Open visual database editor
npm run prisma:migrate         # Create new migration
npm run db:seed                # Re-seed database
npm run db:reset               # Reset and re-seed

# Code Quality
npm run lint                   # Lint code
npm run format                 # Format with Prettier
npm run test                   # Run tests
```

## Troubleshooting

### "Database connection failed"

Check your `DATABASE_URL` in `.env`. Make sure PostgreSQL is running:
```bash
# Test connection
psql -h localhost -U your_user -d heals_db
```

### "Redis connection failed"

Check `REDIS_HOST` and `REDIS_PORT`. Make sure Redis is running:
```bash
# Test connection
redis-cli ping
# Should respond: PONG
```

### "JWT secret not set"

Make sure `.env` has `JWT_SECRET` with a strong random string (minimum 32 characters).

### "Prisma Client not generated"

Run:
```bash
cd apps/api
npx prisma generate
```

### Port already in use

Change `API_PORT` in `.env` to a different port (e.g., 3002).

## Documentation

- **BUILD_STATUS.md** - Detailed build progress
- **IMPLEMENTATION_GUIDE.md** - Complete implementation plan
- **README.md** - System overview
- **apps/api/prisma/schema.prisma** - Database schema

## Support

The foundation is complete and working. You're ready to build the rest of the system!

Need help? Check the implementation guides or review the existing code structure.

---

**Status**: ✅ Ready for Development
**Backend API**: http://localhost:3001/api/v1
**Health Check**: http://localhost:3001/api/v1/health

Happy coding! 🎉
