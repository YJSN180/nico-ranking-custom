import * as https from 'https';

const CF_API_TOKEN = 'ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj';
const ACCOUNT_ID = '5984977746a3dfcd71415bed5c324eb1';

function makeRequest(method: string, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.cloudflare.com',
      port: 443,
      path: `/client/v4${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function listProjects() {
  console.log('📋 Listing existing Cloudflare Pages projects...\n');
  
  try {
    const response = await makeRequest('GET', `/accounts/${ACCOUNT_ID}/pages/projects`);
    
    if (response.success) {
      console.log(`Found ${response.result.length} projects:\n`);
      
      response.result.forEach((project: any) => {
        console.log(`📦 ${project.name}`);
        console.log(`   ID: ${project.id}`);
        console.log(`   URL: https://${project.subdomain}.pages.dev`);
        console.log(`   Created: ${project.created_on}`);
        console.log(`   Branch: ${project.source?.config?.production_branch || 'N/A'}`);
        console.log('');
      });
      
      // Check for our project names
      const nicoRanking = response.result.find((p: any) => p.name === 'nico-ranking');
      const nicoRankingCustom = response.result.find((p: any) => p.name === 'nico-ranking-custom');
      
      if (nicoRanking || nicoRankingCustom) {
        console.log('⚠️  Found existing project(s):');
        if (nicoRanking) console.log(`   - nico-ranking: https://${nicoRanking.subdomain}.pages.dev`);
        if (nicoRankingCustom) console.log(`   - nico-ranking-custom: https://${nicoRankingCustom.subdomain}.pages.dev`);
        console.log('\nYou can either:');
        console.log('1. Use the existing project');
        console.log('2. Delete the existing project and create a new one');
        console.log('3. Use a different project name');
      }
      
    } else {
      console.error('❌ Failed to list projects:');
      console.error('   Errors:', response.errors);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

listProjects();