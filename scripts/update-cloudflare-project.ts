import * as https from 'https';

const CF_API_TOKEN = 'ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj';
const ACCOUNT_ID = '5984977746a3dfcd71415bed5c324eb1';
const PROJECT_NAME = 'nico-ranking-custom';

function makeRequest(method: string, path: string, data?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = data ? JSON.stringify(data) : undefined;
    
    const options = {
      hostname: 'api.cloudflare.com',
      port: 443,
      path: `/client/v4${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${CF_API_TOKEN}`,
        'Content-Type': 'application/json',
        ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
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
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

async function updateProject() {
  console.log(`🔧 Updating Cloudflare Pages project: ${PROJECT_NAME}\n`);
  
  try {
    // 1. Update environment variables
    console.log('1. Updating environment variables...');
    const envVars = {
      production: {
        environment_variables: {
          NEXT_PUBLIC_CONVEX_URL: {
            value: 'https://judicious-lemming-629.convex.cloud',
            type: 'plain_text'
          },
          CF_ACCOUNT_ID: {
            value: ACCOUNT_ID,
            type: 'plain_text'
          },
          CF_NAMESPACE_ID: {
            value: '80f4535c379b4e8cb89ce6dbdb7d2dc9',
            type: 'plain_text'
          },
          CF_API_TOKEN: {
            value: CF_API_TOKEN,
            type: 'secret_text'
          },
          NODE_ENV: {
            value: 'production',
            type: 'plain_text'
          },
          NODE_VERSION: {
            value: '20',
            type: 'plain_text'
          }
        }
      },
      preview: {
        environment_variables: {
          NEXT_PUBLIC_CONVEX_URL: {
            value: 'https://judicious-lemming-629.convex.cloud',
            type: 'plain_text'
          },
          CF_ACCOUNT_ID: {
            value: ACCOUNT_ID,
            type: 'plain_text'
          },
          CF_NAMESPACE_ID: {
            value: '80f4535c379b4e8cb89ce6dbdb7d2dc9',
            type: 'plain_text'
          },
          CF_API_TOKEN: {
            value: CF_API_TOKEN,
            type: 'secret_text'
          },
          NODE_ENV: {
            value: 'production',
            type: 'plain_text'
          },
          NODE_VERSION: {
            value: '20',
            type: 'plain_text'
          }
        }
      }
    };
    
    const envResponse = await makeRequest(
      'PATCH',
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}`,
      { deployment_configs: envVars }
    );
    
    if (envResponse.success) {
      console.log('✅ Environment variables updated successfully');
    } else {
      console.error('❌ Failed to update environment variables:', envResponse.errors);
      return;
    }
    
    // 2. Trigger a new deployment
    console.log('\n2. Triggering new deployment...');
    const deployResponse = await makeRequest(
      'POST',
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments`
    );
    
    if (deployResponse.success) {
      console.log('✅ Deployment triggered successfully!');
      console.log(`   Deployment ID: ${deployResponse.result.id}`);
      console.log(`   URL: ${deployResponse.result.url}`);
      console.log(`   Status: ${deployResponse.result.latest_stage?.status || 'queued'}`);
      
      console.log('\n📌 Monitor deployment progress:');
      console.log(`   Dashboard: https://dash.cloudflare.com/${ACCOUNT_ID}/pages/view/${PROJECT_NAME}`);
      console.log(`   Production URL: https://nico-ranking-custom.pages.dev`);
      
      console.log('\n⏳ Deployment usually takes 3-5 minutes...');
      console.log('   Run `npm run verify:deployment` after deployment completes');
      
    } else {
      console.error('❌ Failed to trigger deployment:', deployResponse.errors);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

updateProject();