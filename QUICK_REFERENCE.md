# 🚀 Quick Reference Card

## Setup Commands (First Time)

```bash
# 1. Install everything
npm install
cd packages/types && npm install && npm run build
cd ../constants && npm install && npm run build
cd ../../apps/api && npm install

# 2. Configure .env
cp ../../.env.example ../../.env
# Edit .env with your database URL, Redis, and Gemini API key

# 3. Setup database
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed

# 4. Start API
npm run dev
```

## Daily Development Commands

```bash
# Start API
cd apps/api && npm run dev

# Start Frontend (when ready)
cd apps/web && npm run dev

# Start Python Service (when ready)
cd apps/document-processor && python -m uvicorn app.main:app --reload

# View Database
cd apps/api && npx prisma studio

# Reset Database
cd apps/api && npm run db:reset
```

## Test Users

All passwords: `Admin@2024!`

```
admin@heals.health      - Administrator
intake@heals.health     - Intake Specialist  
reviewer@heals.health   - Clinical Reviewer
scheduler@heals.health  - Scheduler
np@heals.health         - Nurse Practitioner
billing@heals.health    - Billing Coordinator
```

## Key Endpoints

```
Health:   GET  http://localhost:3001/api/v1/health
Login:    POST http://localhost:3001/api/v1/auth/login
Refresh:  POST http://localhost:3001/api/v1/auth/refresh
Me:       POST http://localhost:3001/api/v1/auth/me
Logout:   POST http://localhost:3001/api/v1/auth/logout
```

## Login Request

```json
POST /api/v1/auth/login
{
  "email": "admin@heals.health",
  "password": "Admin@2024!"
}
```

## Response

```json
{
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG...",
  "user": {
    "id": "uuid",
    "email": "admin@heals.health",
    "firstName": "System",
    "lastName": "Administrator",
    "roles": ["ADMIN"]
  }
}
```

## Using Token

```bash
curl http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## File Structure

```
apps/api/src/
├── main.ts                    # Bootstrap
├── app.module.ts              # Root module
├── health.controller.ts       # Health check
├── database/
│   ├── prisma.service.ts      # Database client
│   └── database.module.ts
├── redis/
│   ├── redis.service.ts       # Redis client
│   └── redis.module.ts
├── common/
│   ├── decorators/            # @Public, @CurrentUser, @Roles
│   └── guards/                # JWT, RBAC, Permissions
└── modules/
    ├── auth/                  # ✅ Authentication
    ├── users/                 # ⏳ User management
    ├── patients/              # ⏳ Patient CRUD
    ├── referrals/             # ⏳ Core workflow
    ├── documents/             # ⏳ File upload + AI
    ├── clinical-review/       # ⏳ Clinical decisions
    ├── appointments/          # ⏳ Scheduling
    ├── encounters/            # ⏳ Visits & notes
    ├── billing/               # ⏳ Claims
    ├── audit/                 # ⏳ Audit logging
    ├── notifications/         # ⏳ Alerts
    └── websocket/             # ⏳ Real-time
```

## Database Models

```
Users & Auth:   users, user_roles, user_scopes, sessions
Workflow:       patients, referrals, referral_assignments, workflow_transitions
Documents:      documents (with AI extraction fields)
Clinical:       clinical_reviews, appointments, encounters
Notes:          clinical_notes, note_reviews
Billing:        claims
Audit:          audit_events
Communication:  notifications, comments
```

## State Machine

```typescript
// Four independent dimensions
{
  pipeline_stage: 'INTAKE' | 'CLINICAL_REVIEW' | 'SCHEDULING' | 
                  'NP_VISIT' | 'NOTES_QA' | 'BILLING',
  
  work_status: 'PENDING' | 'IN_PROGRESS' | 'ON_HOLD' | 
               'BLOCKED_NEEDS_INFO' | 'COMPLETED',
  
  case_outcome: 'ACTIVE' | 'REJECTED' | 'PATIENT_DECLINED' | 
                'DUPLICATE' | 'DISCHARGED' | 'CLOSED',
  
  billing_status: 'NOT_READY' | 'READY' | 'SUBMITTED' | 
                  'REJECTED' | 'DENIED' | 'PAID'
}
```

## Workflow Transitions

```
INTAKE → CLINICAL_REVIEW → SCHEDULING → 
NP_VISIT → NOTES_QA → BILLING
```

**Backward flows allowed**:
- Clinical Review → Intake (if info missing)
- Notes QA → NP Visit (for corrections)

## Roles & Permissions

```typescript
INTAKE_SPECIALIST:
  - referrals.view.intake
  - referrals.create
  - documents.upload
  - patients.create

CLINICAL_REVIEWER:
  - referrals.review.accept
  - referrals.review.reject
  - referrals.review.return
  - notes.review

NURSE_PRACTITIONER:
  - encounters.create
  - notes.create
  - notes.sign

BILLING_COORDINATOR:
  - claims.create
  - claims.submit
```

## Troubleshooting

### Database Connection Failed
```bash
# Check DATABASE_URL in .env
# Ensure PostgreSQL is running
psql -h localhost -U your_user -d your_db
```

### Redis Connection Failed
```bash
# Check REDIS_HOST and REDIS_PORT in .env
# Ensure Redis is running
redis-cli ping
```

### Prisma Client Not Generated
```bash
cd apps/api
npx prisma generate
```

### Port Already in Use
```bash
# Change API_PORT in .env
# Or kill the process
netstat -ano | findstr :3001
taskkill /PID <process_id> /F
```

## Next Steps

1. ✅ Authentication is working
2. ⏳ Build Referrals Module (workflow engine)
3. ⏳ Build WebSocket Gateway (real-time)
4. ⏳ Build Next.js Frontend (Kanban board)
5. ⏳ Build Python AI Service (Gemini)

## Documentation

- **START_HERE.md** - Setup guide
- **BUILD_STATUS.md** - Progress tracker
- **COMPLETE_SYSTEM_SUMMARY.md** - Full system overview
- **IMPLEMENTATION_GUIDE.md** - 35-task plan

## Support

API Running: ✅ http://localhost:3001/api/v1
Health Check: ✅ http://localhost:3001/api/v1/health

**Status**: Ready for development 🎉
