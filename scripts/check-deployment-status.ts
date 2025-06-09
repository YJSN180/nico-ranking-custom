import * as https from 'https';

const CF_API_TOKEN = 'ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj';
const ACCOUNT_ID = '5984977746a3dfcd71415bed5c324eb1';
const PROJECT_NAME = 'nico-ranking-custom';

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

async function checkDeploymentStatus() {
  console.log(`🔍 Checking deployment status for ${PROJECT_NAME}...\n`);
  
  try {
    // Get latest deployments
    const response = await makeRequest(
      'GET',
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments?per_page=5`
    );
    
    if (!response.success) {
      console.error('❌ Failed to get deployments:', response.errors);
      return;
    }
    
    const deployments = response.result;
    if (deployments.length === 0) {
      console.log('No deployments found');
      return;
    }
    
    // Show latest deployment details
    const latest = deployments[0];
    console.log('📦 Latest Deployment:');
    console.log(`   ID: ${latest.id}`);
    console.log(`   URL: ${latest.url}`);
    console.log(`   Environment: ${latest.environment}`);
    console.log(`   Created: ${new Date(latest.created_on).toLocaleString()}`);
    console.log(`   Status: ${latest.latest_stage?.status || 'unknown'}`);
    
    // Show build logs if available
    if (latest.stages && latest.stages.length > 0) {
      console.log('\n📋 Build Stages:');
      latest.stages.forEach((stage: any) => {
        const status = stage.status === 'success' ? '✅' : 
                      stage.status === 'failure' ? '❌' : 
                      stage.status === 'active' ? '🔄' : '⏳';
        console.log(`   ${status} ${stage.name}: ${stage.status}`);
        if (stage.started_on) {
          const duration = stage.ended_on ? 
            `(${Math.round((new Date(stage.ended_on).getTime() - new Date(stage.started_on).getTime()) / 1000)}s)` : 
            '(in progress)';
          console.log(`      Started: ${new Date(stage.started_on).toLocaleTimeString()} ${duration}`);
        }
      });
    }
    
    // Check production alias
    if (latest.deployment_trigger?.metadata?.branch === 'feat/migrate-to-convex-cloudflare') {
      console.log('\n🌐 Production URLs:');
      console.log(`   Preview: ${latest.url}`);
      console.log(`   Production: https://nico-ranking-custom.pages.dev`);
    }
    
    // Status summary
    console.log('\n📊 Status Summary:');
    if (latest.latest_stage?.status === 'success') {
      console.log('   ✅ Deployment successful!');
      console.log('   Run `npm run verify:deployment` to test the production site');
    } else if (latest.latest_stage?.status === 'failure') {
      console.log('   ❌ Deployment failed!');
      console.log('   Check the dashboard for detailed error logs');
    } else {
      console.log('   🔄 Deployment in progress...');
      console.log('   Run this script again in a minute to check status');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkDeploymentStatus();