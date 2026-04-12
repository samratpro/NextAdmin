const axios = require('axios');
const API_BASE = 'http://localhost:8000/api/app';
const AUTH = { email: 'admin@admin.com', password: 'admin' };
const SLUG = 'seo-spider';

async function test() {
  console.log('--- STARTING LIVE API TEST ---');
  
  try {
    // 1. PRE-CHECK
    console.log('\n[1] Testing Pre-Check...');
    const preCheck = await axios.post(`${API_BASE}/pre-check`, AUTH, { headers: { 'x-app-slug': SLUG } });
    console.log('Pre-Check Response:', JSON.stringify(preCheck.data, null, 2));

    // 2. LOGIN (PC-1)
    console.log('\n[2] Testing Login (PC-1)...');
    const login = await axios.post(`${API_BASE}/login`, { ...AUTH, deviceId: 'PC-1', deviceName: 'Test Machine' }, { headers: { 'x-app-slug': SLUG } });
    const token = login.data.appToken;
    console.log('Login Success! Token obtained.');
    console.log('Initial totalCreditsUsed:', login.data.totalCreditsUsed);

    // 3. USE CREDIT
    console.log('\n[3] Using 1 Credit...');
    const use = await axios.post(`${API_BASE}/use-credit`, { appToken: token, taskName: 'Verification Task' }, { headers: { 'x-app-slug': SLUG } });
    console.log('Use Credit Response:', JSON.stringify(use.data, null, 2));

    // 4. CHECK STATUS (Verify totalCreditsUsed incremented)
    console.log('\n[4] Checking Status...');
    const status = await axios.get(`${API_BASE}/status`, { headers: { 'Authorization': `Bearer ${token}`, 'x-app-slug': SLUG } });
    console.log('Status Result Total Used:', status.data.totalCreditsUsed);

    // 5. RE-LOGIN SAME DEVICE (Should delete old session)
    console.log('\n[5] Re-Login Same Device (PC-1)...');
    const relogin = await axios.post(`${API_BASE}/login`, { ...AUTH, deviceId: 'PC-1', deviceName: 'Test Machine Redux' }, { headers: { 'x-app-slug': SLUG } });
    console.log('Re-Login Success. New Token:', relogin.data.appToken.substring(0, 10) + '...');

    // 6. LOGOUT (Should delete session)
    console.log('\n[6] Logging out...');
    // We might hit a lock if we don't wait 1 min, but the system should allow it if we set lock to 0 or wait.
    // I previously set it to 1 minute. I'll attempt logout and report the lock status.
    try {
        const logout = await axios.post(`${API_BASE}/logout`, {}, { headers: { 'Authorization': `Bearer ${relogin.data.appToken}`, 'x-app-slug': SLUG } });
        console.log('Logout Response:', JSON.stringify(logout.data, null, 2));
    } catch (err) {
        if (err.response && err.response.status === 423) {
            console.log('Logout Locked (As expected):', err.response.data.error);
        } else {
            console.log('Logout Error:', err.message);
        }
    }

  } catch (err) {
    console.error('Test Failed:', err.response ? err.response.data : err.message);
  }
}

test();
