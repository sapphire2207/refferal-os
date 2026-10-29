import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const SCREENSHOT_DIR = 'D:\\ReferralSystem\\artifacts\\screenshots';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA_DIR = 'D:\\ReferralSystem\\.tmp_edge_qa_profile';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

let edgeProc = null;
let apiProc = null;
let webProc = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404 || res.status === 401 || res.status === 307 || res.status === 308) {
        return true;
      }
    } catch (e) {
      // wait and retry
    }
    await sleep(300);
  }
  return false;
}

class EdgeCDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setViewport(width, height, isMobile = false) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
    });
    await this.send('Emulation.setVisibleSize', { width, height }).catch(() => {});
    await sleep(200);
  }

  async navigate(url, waitAfter = 1200) {
    await this.send('Page.navigate', { url });
    await sleep(waitAfter);
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      console.warn('Evaluation exception:', res.exceptionDetails);
    }
    return res.result?.value;
  }

  async screenshot(filename) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const outPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`[Screenshot saved]: ${filename}`);
  }

  async checkOverflow() {
    return await this.evaluate(`
      (() => {
        const docWidth = document.documentElement.clientWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const elementsWithOverflow = [];
        
        document.querySelectorAll('*').forEach(el => {
          if (el.scrollWidth > docWidth + 2 && el.offsetWidth > docWidth) {
            elementsWithOverflow.push({
              tag: el.tagName,
              className: el.className?.toString().slice(0, 50),
              scrollWidth: el.scrollWidth,
              docWidth
            });
          }
        });
        
        return {
          hasPageOverflow: scrollWidth > docWidth + 2,
          scrollWidth,
          docWidth,
          overflowElements: elementsWithOverflow.slice(0, 5)
        };
      })()
    `);
  }

  async close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function runVisualQA() {
  console.log('=== STARTING HEALS ON WHEELS VISUAL QA SUITE ===\n');

  // Step 1: Start API Server if not already running
  const apiListening = await waitForHttp('http://127.0.0.1:3001/api/v1/auth/me', 1000);
  if (!apiListening) {
    console.log('Starting NestJS API Server (dist/main.js)...');
    apiProc = spawn('node', ['apps/api/dist/main.js'], {
      cwd: 'D:\\ReferralSystem',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    apiProc.stderr.on('data', d => process.stderr.write(`[API ERR] ${d}`));
    const apiReady = await waitForHttp('http://127.0.0.1:3001/api/v1/notifications', 15000);
    if (!apiReady) {
      throw new Error('API failed to start on port 3001');
    }
    console.log('NestJS API is healthy on port 3001.\n');
  } else {
    console.log('NestJS API is already running on port 3001.\n');
  }

  // Step 2: Start Next.js Web Server if not already running
  const webListening = await waitForHttp('http://127.0.0.1:3000/login', 1000);
  if (!webListening) {
    console.log('Starting Next.js Server (next start on port 3000)...');
    webProc = spawn('npm.cmd', ['run', 'start', '-w', 'apps/web'], {
      cwd: 'D:\\ReferralSystem',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    webProc.stderr.on('data', d => process.stderr.write(`[WEB ERR] ${d}`));
    const webReady = await waitForHttp('http://127.0.0.1:3000/login', 15000);
    if (!webReady) {
      throw new Error('Web failed to start on port 3000');
    }
    console.log('Next.js Web is healthy on port 3000.\n');
  } else {
    console.log('Next.js Web is already running on port 3000.\n');
  }

  // Step 3: Launch Edge in Headless mode with CDP
  console.log('Launching Microsoft Edge Headless with CDP (port 9222)...');
  edgeProc = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${USER_DATA_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--hide-scrollbars',
    'about:blank',
  ]);

  await sleep(1500);
  const targetRes = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' });
  const target = await targetRes.json();
  const cdp = new EdgeCDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  console.log('Connected to Edge via CDP.\n');

  const inspectionResults = [];

  // ==========================================
  // ROUTE 1: /login
  // ==========================================
  console.log('--- Inspecting Route 1: /login ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/login');
  await cdp.screenshot('01_login_desktop_1440.png');

  let overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/login', viewport: '1440x900', overflow });

  // Tablet
  await cdp.setViewport(1024, 768);
  await cdp.screenshot('01_login_tablet_1024.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/login', viewport: '1024x768', overflow });

  // Mobile
  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('01_login_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/login', viewport: '390x844', overflow });

  // Dark Mode on Login
  await cdp.setViewport(1440, 900);
  await cdp.evaluate(`document.documentElement.classList.add('dark')`);
  await sleep(200);
  await cdp.screenshot('01_login_dark_1440.png');
  await cdp.evaluate(`document.documentElement.classList.remove('dark')`);

  // Perform Login via Persona Button or Direct Token injection
  console.log('Logging in as Admin via persona switcher...');
  const clickedPersona = await cdp.evaluate(`
    (() => {
      // Find Admin persona card in the switcher by email and click its Sign In button
      const allDivs = Array.from(document.querySelectorAll('div'));
      const adminCard = allDivs.find(d => d.textContent.includes('admin@heals.health') && d.textContent.includes('Full Administrator'));
      if (adminCard) {
        const btns = Array.from(adminCard.querySelectorAll('button'));
        const signInBtn = btns.find(b => b.textContent.includes('Sign In'));
        if (signInBtn) {
          signInBtn.click();
          return true;
        }
      }
      return false;
    })()
  `);
  console.log('Admin persona quick-login clicked:', clickedPersona);
  await sleep(2500);

  // If still on login, use API to authenticate and set localStorage directly
  const currentUrl = await cdp.evaluate('window.location.href');
  if (currentUrl.includes('/login')) {
    console.log('Directly obtaining auth tokens from /api/v1/auth/login...');
    const loginRes = await fetch('http://127.0.0.1:3001/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@heals.health', password: 'Admin@2024!' }),
    });
    const loginData = await loginRes.json();
    if (loginData.accessToken) {
      await cdp.evaluate(`
        localStorage.setItem('heals_access_token', '${loginData.accessToken}');
        localStorage.setItem('heals_refresh_token', '${loginData.refreshToken}');
      `);
      await cdp.navigate('http://localhost:3000/dashboard');
    }
  }

  // ==========================================
  // ROUTE 2: /dashboard
  // ==========================================
  console.log('\n--- Inspecting Route 2: /dashboard ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/dashboard', 2000);
  await cdp.screenshot('02_dashboard_desktop_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/dashboard', viewport: '1440x900', overflow });

  // Test Timeframe Switcher on Dashboard (click 30d, 3m)
  await cdp.evaluate(`
    (() => {
      const tabs = Array.from(document.querySelectorAll('button'));
      const tab30d = tabs.find(b => b.textContent.trim() === '30d');
      if (tab30d) tab30d.click();
    })()
  `);
  await sleep(400);

  // Tablet
  await cdp.setViewport(1024, 768);
  await cdp.screenshot('02_dashboard_tablet_1024.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/dashboard', viewport: '1024x768', overflow });

  // Mobile
  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('02_dashboard_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/dashboard', viewport: '390x844', overflow });

  // Dark Mode
  await cdp.setViewport(1440, 900);
  await cdp.evaluate(`document.documentElement.classList.add('dark')`);
  await sleep(200);
  await cdp.screenshot('02_dashboard_dark_1440.png');
  await cdp.evaluate(`document.documentElement.classList.remove('dark')`);

  // ==========================================
  // ROUTE 3: /referrals (Kanban Pipeline & Drawer)
  // ==========================================
  console.log('\n--- Inspecting Route 3: /referrals ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/referrals', 2000);
  await cdp.screenshot('03_referrals_kanban_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/referrals', viewport: '1440x900', overflow });

  // Mobile Kanban
  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('03_referrals_kanban_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/referrals', viewport: '390x844', overflow });

  // Open Referral Drawer by clicking first Details button or card
  await cdp.setViewport(1440, 900);
  const openedDrawer = await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const detailsBtn = btns.find(b => b.textContent.includes('Details'));
      if (detailsBtn) {
        detailsBtn.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('Opened referral drawer:', openedDrawer);
  await sleep(600);
  await cdp.screenshot('04_referral_drawer_overview.png');

  // Click Comments Tab in Drawer
  await cdp.evaluate(`
    (() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const commentTab = tabs.find(t => t.textContent.includes('Comments'));
      if (commentTab) commentTab.click();
    })()
  `);
  await sleep(400);
  await cdp.screenshot('04_referral_drawer_comments.png');

  // Click Documents Tab in Drawer
  await cdp.evaluate(`
    (() => {
      const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
      const docTab = tabs.find(t => t.textContent.includes('Documents'));
      if (docTab) docTab.click();
    })()
  `);
  await sleep(400);
  await cdp.screenshot('04_referral_drawer_documents.png');

  // Dark Mode Drawer
  await cdp.evaluate(`document.documentElement.classList.add('dark')`);
  await sleep(200);
  await cdp.screenshot('04_referral_drawer_dark.png');
  await cdp.evaluate(`document.documentElement.classList.remove('dark')`);

  // Close Drawer by pressing Escape or clicking outside
  await cdp.evaluate(`
    (() => {
      const closeBtn = document.querySelector('[data-slot="dialog-close"], button[aria-label="Close"]');
      if (closeBtn) closeBtn.click();
      else {
        // Trigger Escape key
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }
    })()
  `);
  await sleep(400);

  // ==========================================
  // ROUTE 4: /referrals/new
  // ==========================================
  console.log('\n--- Inspecting Route 4: /referrals/new ---');
  await cdp.navigate('http://localhost:3000/referrals/new', 1500);
  await cdp.screenshot('05_referrals_new_desktop_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/referrals/new', viewport: '1440x900', overflow });

  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('05_referrals_new_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/referrals/new', viewport: '390x844', overflow });

  // ==========================================
  // ROUTE 5: /patients & /patients/:id
  // ==========================================
  console.log('\n--- Inspecting Route 5: /patients ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/patients', 1500);
  await cdp.screenshot('06_patients_directory_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/patients', viewport: '1440x900', overflow });

  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('06_patients_directory_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/patients', viewport: '390x844', overflow });

  // Click View Profile on first patient
  await cdp.setViewport(1440, 900);
  const navigatedToPatient = await cdp.evaluate(`
    (() => {
      const links = Array.from(document.querySelectorAll('a'));
      const profileLink = links.find(l => l.href.includes('/patients/'));
      if (profileLink) {
        profileLink.click();
        return true;
      }
      return false;
    })()
  `);
  console.log('Navigated to patient profile:', navigatedToPatient);
  await sleep(1500);
  await cdp.screenshot('06_patient_detail_1440.png');

  // ==========================================
  // ROUTE 6: /schedule
  // ==========================================
  console.log('\n--- Inspecting Route 6: /schedule ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/schedule', 1500);
  await cdp.screenshot('07_schedule_desktop_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/schedule', viewport: '1440x900', overflow });

  // Click "Book Mobile Visit" to test dispatch form toggle
  await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const bookBtn = btns.find(b => b.textContent.includes('Book Mobile Visit'));
      if (bookBtn) bookBtn.click();
    })()
  `);
  await sleep(400);
  await cdp.screenshot('07_schedule_booking_open.png');

  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('07_schedule_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/schedule', viewport: '390x844', overflow });

  // ==========================================
  // ROUTE 7: /visits
  // ==========================================
  console.log('\n--- Inspecting Route 7: /visits ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/visits', 1500);
  await cdp.screenshot('08_visits_desktop_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/visits', viewport: '1440x900', overflow });

  // Click first visit in queue to view SOAP documentation form
  await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const docBtn = btns.find(b => b.textContent.includes('Document Visit'));
      if (docBtn) docBtn.click();
    })()
  `);
  await sleep(400);
  await cdp.screenshot('08_visits_soap_active.png');

  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('08_visits_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/visits', viewport: '390x844', overflow });

  // ==========================================
  // ROUTE 8: /notes-review
  // ==========================================
  console.log('\n--- Inspecting Route 8: /notes-review ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/notes-review', 1500);
  await cdp.screenshot('09_notes_review_desktop_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/notes-review', viewport: '1440x900', overflow });

  // Click first note to review if present
  await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const reviewBtn = btns.find(b => b.textContent.includes('Review Documentation'));
      if (reviewBtn) reviewBtn.click();
    })()
  `);
  await sleep(400);

  // Trigger Return for Correction dialog to inspect danger confirmation styling
  const openedReturnDialog = await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const returnBtn = btns.find(b => b.textContent.includes('Return for Correction'));
      if (returnBtn) {
        returnBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await sleep(400);
  if (openedReturnDialog) {
    await cdp.screenshot('09_notes_review_dialog.png');
    // cancel dialog
    await cdp.evaluate(`
      (() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await sleep(200);
  }

  // ==========================================
  // ROUTE 9: /billing
  // ==========================================
  console.log('\n--- Inspecting Route 9: /billing ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/billing', 1500);
  await cdp.screenshot('10_billing_desktop_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/billing', viewport: '1440x900', overflow });

  // Test Mark Denied dialog
  const openedDenyDialog = await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const denyBtn = btns.find(b => b.textContent.includes('Mark Denied'));
      if (denyBtn) {
        denyBtn.click();
        return true;
      }
      return false;
    })()
  `);
  await sleep(400);
  if (openedDenyDialog) {
    await cdp.screenshot('10_billing_deny_dialog.png');
    await cdp.evaluate(`
      (() => {
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
        if (cancelBtn) cancelBtn.click();
      })()
    `);
    await sleep(200);
  }

  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('10_billing_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/billing', viewport: '390x844', overflow });

  // ==========================================
  // ROUTE 10: /notifications
  // ==========================================
  console.log('\n--- Inspecting Route 10: /notifications ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/notifications', 1500);
  await cdp.screenshot('11_notifications_desktop_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/notifications', viewport: '1440x900', overflow });

  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('11_notifications_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/notifications', viewport: '390x844', overflow });

  // ==========================================
  // ROUTE 11: /admin/users
  // ==========================================
  console.log('\n--- Inspecting Route 11: /admin/users ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/admin/users', 1500);
  await cdp.screenshot('12_admin_users_desktop_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/admin/users', viewport: '1440x900', overflow });

  // Test Invite Drawer
  await cdp.evaluate(`
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const inviteBtn = btns.find(b => b.textContent.includes('Invite Team Member'));
      if (inviteBtn) inviteBtn.click();
    })()
  `);
  await sleep(400);
  await cdp.screenshot('12_admin_users_invite_drawer.png');
  // Close invite drawer
  await cdp.evaluate(`
    (() => {
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Cancel');
      if (cancelBtn) cancelBtn.click();
    })()
  `);
  await sleep(300);

  // ==========================================
  // ROUTE 12: /admin/audit
  // ==========================================
  console.log('\n--- Inspecting Route 12: /admin/audit ---');
  await cdp.setViewport(1440, 900);
  await cdp.navigate('http://localhost:3000/admin/audit', 1500);
  await cdp.screenshot('13_admin_audit_desktop_1440.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/admin/audit', viewport: '1440x900', overflow });

  // Dark Mode Audit
  await cdp.evaluate(`document.documentElement.classList.add('dark')`);
  await sleep(200);
  await cdp.screenshot('13_admin_audit_dark_1440.png');
  await cdp.evaluate(`document.documentElement.classList.remove('dark')`);

  await cdp.setViewport(390, 844, true);
  await cdp.screenshot('13_admin_audit_mobile_390.png');
  overflow = await cdp.checkOverflow();
  inspectionResults.push({ route: '/admin/audit', viewport: '390x844', overflow });

  // Close CDP
  await cdp.close();

  // Print Summary Table of Overflows
  console.log('\n=== VISUAL QA LAYOUT & OVERFLOW AUDIT RESULTS ===');
  console.table(inspectionResults.map(r => ({
    Route: r.route,
    Viewport: r.viewport,
    Overflow: r.overflow?.hasPageOverflow ? 'YES (DEFECT)' : 'NONE (CLEAN)',
    ScrollWidth: r.overflow?.scrollWidth,
    DocWidth: r.overflow?.docWidth,
  })));

  // Report any elements causing overflow
  const defectRoutes = inspectionResults.filter(r => r.overflow?.hasPageOverflow);
  if (defectRoutes.length > 0) {
    console.log('\n⚠️ Found routes with horizontal overflow:');
    defectRoutes.forEach(d => {
      console.log(`- ${d.route} (${d.viewport}): scrollWidth ${d.overflow.scrollWidth} > clientWidth ${d.overflow.docWidth}`);
      console.log('  Elements:', d.overflow.overflowElements);
    });
  } else {
    console.log('\n✅ ZERO HORIZONTAL OVERFLOW DETECTED across all tested routes and viewports (1440px, 1024px, 390px)!');
  }

  // Gracefully terminate Edge process
  if (edgeProc) edgeProc.kill();
  if (apiProc) apiProc.kill();
  if (webProc) webProc.kill();

  console.log('\n=== VISUAL QA EXECUTION COMPLETED SUCCESSFULLY ===');
}

runVisualQA().catch(err => {
  console.error('Visual QA run failed:', err);
  if (edgeProc) edgeProc.kill();
  if (apiProc) apiProc.kill();
  if (webProc) webProc.kill();
  process.exit(1);
});
