# Quick Start Guide

## Prerequisites

- Node.js 18.17+ and npm 9+
- Docker Desktop installed and running
- Python 3.11+ (for document processor)
- Code editor (VS Code recommended)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
# Install root workspace dependencies
npm install

# Build shared packages
cd packages/types
npm install
npm run build
cd ../constants
npm install
npm run build
cd ../..
```

### 2. Start Infrastructure Services

```bash
# Start PostgreSQL and Redis via Docker
npm run docker:up

# Verify services are running
docker ps
# Should show heals-postgres and heals-redis containers
```

### 3. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your Gemini API key
# The file is already configured for local development
```

### 4. Set Up Database

```bash
cd apps/api
npm install
npm install @prisma/client prisma

# Generate Prisma client
npx prisma generate

# Create database migration
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view database
npx prisma studio
```

### 5. Create Seed Script

Create `apps/api/prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Hash password
  const passwordHash = await bcrypt.hash('Admin@2024!', 12);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { email: 'admin@heals.health' },
    update: {},
    create: {
      email: 'admin@heals.health',
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      isActive: true,
    },
  });

  // Assign admin role
  await prisma.userRole.create({
    data: {
      userId: admin.id,
      role: 'ADMIN',
    },
  });

  // Create test patient
  const patient = await prisma.patient.create({
    data: {
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: new Date('1980-01-01'),
      medicalRecordNumber: 'MRN001',
      phone: '555-0100',
      state: 'CA',
    },
  });

  // Create test referral
  await prisma.referral.create({
    data: {
      patientId: patient.id,
      pipelineStage: 'INTAKE',
      workStatus: 'PENDING',
      caseOutcome: 'ACTIVE',
      billingStatus: 'NOT_READY',
      priority: 'ROUTINE',
      referralSource: 'Hospital XYZ',
      insurancePayer: 'Blue Cross',
      site: 'main',
      state: 'CA',
    },
  });

  console.log('✅ Database seeded successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run the seed:

```bash
npm run db:seed
```

### 6. What's Next?

You now have:
- ✅ Project structure with monorepo
- ✅ PostgreSQL database with complete schema
- ✅ Redis for caching and real-time
- ✅ Shared TypeScript types and constants
- ✅ Seeded database with test data

**Next Steps:**

1. **Initialize NestJS Backend** (See IMPLEMENTATION_GUIDE.md Phase 2)
   - Scaffold NestJS modules
   - Implement authentication
   - Build referral workflow engine

2. **Initialize Next.js Frontend** (See IMPLEMENTATION_GUIDE.md Phase 3)
   - Set up Next.js with Tailwind CSS
   - Create login page
   - Build Kanban board

3. **Initialize Python Service** (See IMPLEMENTATION_GUIDE.md Phase 4)
   - Set up FastAPI
   - Integrate Gemini AI
   - Build extraction endpoint

## Common Issues

### Docker Not Running
```bash
# Start Docker Desktop first, then run:
npm run docker:up
```

### Port Already in Use
```bash
# Find and kill process using port 5432 or 6379
# Windows:
netstat -ano | findstr :5432
taskkill /PID <process_id> /F

# Or change ports in docker-compose.yml and .env
```

### Prisma Generate Fails
```bash
cd apps/api
npm install @prisma/client prisma --save
npx prisma generate
```

### Database Connection Error
```bash
# Ensure Docker containers are running:
docker ps

# Reset database:
npm run docker:down
docker volume rm heals-on-wheels_postgres_data
npm run docker:up
cd apps/api
npx prisma migrate dev
```

## Development Workflow

```bash
# Terminal 1: Backend API
cd apps/api
npm run dev

# Terminal 2: Frontend Web
cd apps/web
npm run dev

# Terminal 3: Python Document Processor
cd apps/document-processor
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Terminal 4: Watch shared packages
npm run dev -w packages/types -w packages/constants
```

## Test Credentials (After Seeding)

- **Email**: admin@heals.health
- **Password**: Admin@2024!
- **Role**: Administrator

## Useful Commands

```bash
# View database in browser
cd apps/api
npx prisma studio

# Reset database
npm run db:reset

# Check Docker services
docker ps
docker logs heals-postgres
docker logs heals-redis

# Format all code
npm run format

# Lint all code
npm run lint

# Run all tests
npm run test
```

## Architecture at a Glance

```
Your Computer
├── PostgreSQL (Docker) :5432
├── Redis (Docker) :6379
├── NestJS API :3001
├── Next.js Web :3000
└── Python AI Service :8000
```

## Next Reading

- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - Detailed implementation steps
- [README.md](./README.md) - System overview
- [apps/api/prisma/schema.prisma](./apps/api/prisma/schema.prisma) - Database schema

---

**You're ready to build!** 🚀

Follow the IMPLEMENTATION_GUIDE.md for the complete development plan.
