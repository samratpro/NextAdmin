const http = require('http');

http.get('http://localhost:8000/api/custom-service/assignable-users', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('Users:', JSON.stringify(JSON.parse(data), null, 2));
    });
}).on('error', (err) => {
    console.error('Error:', err.message);
});
