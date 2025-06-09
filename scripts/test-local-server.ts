import * as http from 'http';

async function testLocalServer() {
  console.log("Testing local server...\n");
  
  // 1. Snapshot API
  await testEndpoint('/api/snapshot', 'Snapshot API');
  
  // 2. Ranking API
  await testEndpoint('/api/ranking?genre=all&period=24h', 'Ranking API');
  
  // 3. Home page
  await testEndpoint('/', 'Home page');
}

function testEndpoint(path: string, name: string): Promise<void> {
  return new Promise((resolve) => {
    console.log(`Testing ${name} (${path})...`);
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      console.log(`  Status: ${res.statusCode}`);
      console.log(`  Content-Type: ${res.headers['content-type']}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          if (res.headers['content-type']?.includes('application/json')) {
            try {
              const json = JSON.parse(data);
              console.log(`  ✓ Success - Data keys: ${Object.keys(json).join(', ')}`);
              if (json.items) {
                console.log(`    Items: ${json.items.length}`);
              }
              if (json.timestamp) {
                console.log(`    Timestamp: ${json.timestamp}`);
              }
            } catch (e) {
              console.log(`  ✗ Invalid JSON response`);
            }
          } else {
            console.log(`  ✓ Success - HTML response (${data.length} bytes)`);
          }
        } else {
          console.log(`  ✗ Error response`);
          if (data) {
            try {
              const error = JSON.parse(data);
              console.log(`    Error: ${error.error || 'Unknown error'}`);
            } catch {
              console.log(`    Response: ${data.substring(0, 100)}...`);
            }
          }
        }
        console.log('');
        resolve();
      });
    });
    
    req.on('error', (err) => {
      console.log(`  ✗ Connection error: ${err.message}`);
      console.log('');
      resolve();
    });
    
    req.on('timeout', () => {
      console.log(`  ✗ Request timeout`);
      req.destroy();
      console.log('');
      resolve();
    });
    
    req.end();
  });
}

// Wait a bit for server to be ready
setTimeout(() => {
  testLocalServer();
}, 3000);