const API_BASE = 'http://localhost:8000/api/app';
const AUTH = { email: 'admin@admin.com', password: 'admin' };
const SLUG = 'seo-spider';

async function test() {
  console.log('--- STARTING LIVE API TEST (Using fetch) ---');
  
  try {
    const headers = { 'Content-Type': 'application/json', 'x-app-slug': SLUG };

    // 1. PRE-CHECK
    console.log('\n[1] Testing Pre-Check...');
    const preCheckRes = await fetch(`${API_BASE}/pre-check`, {
        method: 'POST',
        headers,
        body: JSON.stringify(AUTH)
    });
    console.log('Pre-Check Response:', await preCheckRes.json());

    // 2. LOGIN (PC-1)
    console.log('\n[2] Testing Login (PC-1)...');
    const loginRes = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...AUTH, deviceId: 'PC-1', deviceName: 'Test Machine' })
    });
    const loginData = await loginRes.json();
    if (!loginData.success) {
        console.error('Login Failed!', loginData);
        return;
    }
    const token = loginData.appToken;
    console.log('Login Success! Token obtained.');
    console.log('Initial totalCreditsUsed:', loginData.totalCreditsUsed);

    // 3. USE CREDIT
    console.log('\n[3] Using 1 Credit...');
    const useRes = await fetch(`${API_BASE}/use-credit`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ appToken: token, taskName: 'Verification Task' })
    });
    console.log('Use Credit Response:', await useRes.json());

    // 4. CHECK STATUS (Verify totalCreditsUsed incremented)
    console.log('\n[4] Checking Status...');
    const statusRes = await fetch(`${API_BASE}/status`, {
        headers: { ...headers, 'Authorization': `Bearer ${token}` }
    });
    const statusData = await statusRes.json();
    console.log('Status Result Total Used:', statusData.totalCreditsUsed);

    // 5. RE-LOGIN SAME DEVICE (Should delete old session)
    console.log('\n[5] Re-Login Same Device (PC-1)...');
    const reloginRes = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...AUTH, deviceId: 'PC-1', deviceName: 'Test Machine Redux' })
    });
    const reloginData = await reloginRes.json();
    console.log('Re-Login Success. New Token:', reloginData.appToken.substring(0, 10) + '...');

    // 6. LOGOUT (Should delete session)
    console.log('\n[6] Logging out...');
    const logoutRes = await fetch(`${API_BASE}/logout`, { // This will fail if locked, which is what we want to see.
        method: 'POST',
        headers: { ...headers, 'Authorization': `Bearer ${reloginData.appToken}` },
        body: '{}'
    });
    console.log('Logout response status:', logoutRes.status);
    console.log('Logout JSON response:', await logoutRes.json());

  } catch (err) {
    console.error('Test Failed:', err.message);
  }
}

test();
