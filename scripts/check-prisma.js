const { execSync } = require('child_process');
const fs = require('fs');

const env = fs.readFileSync('apps/api/.env', 'utf8');
const line = env.split('\n').find(l => l.trim().startsWith('DATABASE_URL='));
const dbUrl = line.substring(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');

try {
  const out = execSync('npx prisma migrate status --schema=apps/api/prisma/schema.prisma', {
    env: { ...process.env, DATABASE_URL: dbUrl }
  });
  console.log(out.toString());
  process.exit(0);
} catch (e) {
  console.log(e.stdout ? e.stdout.toString() : e.message);
  process.exit(e.status || 1);
}

