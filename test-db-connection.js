/**
 * PostgreSQL Connection Tester
 * 
 * Usage:
 *   node test-db-connection.js "postgresql://user:password@host:5432/dbname?sslmode=require"
 * 
 * Or pass via environment variable:
 *   $env:DATABASE_URL="postgresql://user:password@host:5432/dbname"
 *   node test-db-connection.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Try loading from .env if present
function loadEnvFile() {
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'apps', 'api', '.env'),
    path.join(__dirname, '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...values] = trimmed.split('=');
            let val = values.join('=').trim();
            // remove surrounding quotes
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key.trim()]) {
              process.env[key.trim()] = val;
            }
          }
        }
        console.log(`[i] Loaded environment from: ${envPath}`);
        break;
      } catch (err) {
        // ignore
      }
    }
  }
}

loadEnvFile();

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('\n\x1b[31m[Error] No PostgreSQL connection string provided!\x1b[0m');
  console.log('\nPlease provide a connection string:');
  console.log('  \x1b[36mnode test-db-connection.js "postgresql://username:password@localhost:5432/database_name"\x1b[0m');
  console.log('\nOr set DATABASE_URL in your .env file or environment variables.');
  process.exit(1);
}

// Mask password for display
function maskConnectionString(uri) {
  try {
    const parsed = new URL(uri);
    if (parsed.password) {
      parsed.password = '********';
    }
    return parsed.toString();
  } catch {
    return uri.replace(/:([^:@]+)@/, ':********@');
  }
}

async function testConnection(url) {
  console.log('\n========================================');
  console.log('   PostgreSQL Connection Health Check   ');
  console.log('========================================\n');

  console.log(`Target URL: \x1b[36m${maskConnectionString(url)}\x1b[0m\n`);

  let clientConfig = { connectionString: url };

  // Check if SSL is required or requested
  const isCloudOrSsl = 
    url.includes('sslmode=require') || 
    url.includes('neon.tech') || 
    url.includes('supabase.co') || 
    url.includes('render.com') || 
    url.includes('railway.app') || 
    url.includes('amazonaws.com');

  if (isCloudOrSsl) {
    clientConfig.ssl = { rejectUnauthorized: false };
    console.log('[i] SSL mode enabled (rejectUnauthorized: false for cloud compatibility)');
  }

  const client = new Client(clientConfig);
  const startTime = Date.now();

  try {
    console.log('[...] Connecting to database...');
    await client.connect();
    const connectTime = Date.now() - startTime;
    console.log(`[\x1b[32m+\x1b[0m] Connected successfully in ${connectTime}ms!`);

    console.log('[...] Executing test query...');
    const result = await client.query(`
      SELECT 
        version() AS version,
        current_database() AS database,
        current_user AS user,
        inet_server_addr() AS server_ip,
        inet_server_port() AS server_port,
        NOW() AS server_time;
    `);

    const totalTime = Date.now() - startTime;
    const row = result.rows[0];

    console.log('\n\x1b[32m✔ CONNECTION SUCCESSFUL!\x1b[0m');
    console.log('----------------------------------------');
    console.log(`Database Name : ${row.database}`);
    console.log(`Connected User: ${row.user}`);
    console.log(`Server IP     : ${row.server_ip || 'N/A'}`);
    console.log(`Server Port   : ${row.server_port || 'N/A'}`);
    console.log(`Server Time   : ${row.server_time}`);
    console.log(`Roundtrip Time: ${totalTime}ms`);
    console.log(`PG Version    : ${row.version.split(' on ')[0]}`);
    console.log('----------------------------------------\n');

    await client.end();
    process.exit(0);
  } catch (error) {
    await client.end().catch(() => {});

    console.error('\n\x1b[31m✖ CONNECTION FAILED!\x1b[0m');
    console.error('----------------------------------------');
    console.error(`Error Code   : ${error.code || 'UNKNOWN'}`);
    console.error(`Error Message: ${error.message}`);
    console.error('----------------------------------------');

    console.log('\nDiagnostic Advice:');
    if (error.code === 'ECONNREFUSED') {
      console.log(' - The host/port is not accepting connections.');
      console.log(' - Verify PostgreSQL service is running and listening on the specified port.');
      console.log(' - Check firewall and pg_hba.conf settings.');
    } else if (error.code === 'ENOTFOUND') {
      console.log(' - Hostname could not be resolved. Verify the host address/domain.');
    } else if (error.code === 'ETIMEDOUT') {
      console.log(' - Connection timed out.');
      console.log(' - For cloud databases (AWS, Neon, Supabase, Render), ensure your IP address is whitelisted / allowed.');
    } else if (error.code === '28P01') {
      console.log(' - Password authentication failed. Check your username and password.');
    } else if (error.code === '3D000') {
      console.log(' - Database does not exist. Ensure the database name is spelled correctly or create it first.');
    } else if (error.message && error.message.includes('SSL')) {
      console.log(' - SSL configuration issue. Append "?sslmode=require" to your connection URL.');
    } else {
      console.log(' - Check your database connection string and network connectivity.');
    }
    console.log('');
    process.exit(1);
  }
}

testConnection(connectionString);
