const http = require('http');

http.get('http://localhost:8000/api/test-users', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            console.log('Test Users:', JSON.stringify(JSON.parse(data), null, 2));
        } catch(e) {
            console.log('Raw:', data);
        }
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
