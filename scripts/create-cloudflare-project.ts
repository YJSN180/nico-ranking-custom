import * as https from 'https';

const CF_API_TOKEN = 'ZfpisofOxDnrUx8MhJCOw8QG1TVO_Z236y6q5Jdj';
const ACCOUNT_ID = '5984977746a3dfcd71415bed5c324eb1';

interface CloudflareResponse {
  success: boolean;
  result?: any;
  errors?: any[];
  messages?: any[];
}

function makeRequest(method: string, path: string, data?: any): Promise<CloudflareResponse> {
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

async function createCloudflareProject() {
  console.log('🚀 Creating Cloudflare Pages project...\n');

  try {
    // 1. Create Pages project
    console.log('1. Creating Pages project...');
    const projectData = {
      name: 'nico-ranking-custom',
      source: {
        type: 'github',
        config: {
          owner: 'YJSN180',
          repo_name: 'nico-ranking-custom',
          production_branch: 'feat/migrate-to-convex-cloudflare',
          pr_comments_enabled: true,
          deployments_enabled: true,
          production_deployments_enabled: true,
          preview_deployment_setting: 'all'
        }
      },
      build_config: {
        build_command: 'npm run build',
        destination_dir: '.vercel/output/static',
        root_dir: '',
        web_analytics_tag: null,
        web_analytics_token: null
      },
      deployment_configs: {
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
          },
          compatibility_date: '2024-01-01',
          compatibility_flags: [],
          fail_open: false,
          always_use_latest_compatibility_date: false
        }
      }
    };

    const response = await makeRequest('POST', `/accounts/${ACCOUNT_ID}/pages/projects`, projectData);

    if (response.success) {
      console.log('✅ Project created successfully!');
      console.log(`   Project name: ${response.result.name}`);
      console.log(`   Project ID: ${response.result.id}`);
      console.log(`   Production URL: https://${response.result.subdomain}.pages.dev`);
      
      // 2. Trigger initial deployment
      console.log('\n2. Triggering initial deployment...');
      const deployResponse = await makeRequest('POST', `/accounts/${ACCOUNT_ID}/pages/projects/${response.result.name}/deployments`);
      
      if (deployResponse.success) {
        console.log('✅ Deployment triggered successfully!');
        console.log(`   Deployment ID: ${deployResponse.result.id}`);
        console.log(`   Status: ${deployResponse.result.stages[0]?.status || 'queued'}`);
      } else {
        console.log('⚠️  Project created but deployment failed to trigger');
        console.log('   You can manually trigger deployment from the dashboard');
      }
      
      console.log('\n🎉 Setup complete!');
      console.log(`   Dashboard: https://dash.cloudflare.com/${ACCOUNT_ID}/pages/view/${response.result.name}`);
      console.log(`   Production URL: https://${response.result.subdomain}.pages.dev`);
      
    } else {
      console.error('❌ Failed to create project:');
      console.error('   Errors:', response.errors);
      console.error('   Messages:', response.messages);
    }

  } catch (error) {
    console.error('❌ Error creating Cloudflare project:', error);
    process.exit(1);
  }
}

createCloudflareProject();