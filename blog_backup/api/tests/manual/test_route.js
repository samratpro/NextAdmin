const axios = require('axios');

async function test() {
    try {
        const res = await axios.get('http://localhost:8000/api/custom-service/assignable-users', {
            params: { q: '' },
            headers: {
                // We need to bypass auth or provide it.
                // Since I'm on the same machine, I might be able to check the db directly again.
            }
        });
        console.log('Result:', res.data);
    } catch (err) {
        console.error('Error:', err.response?.status, err.response?.data);
    }
}

// test();
