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

async function fixBuildConfiguration() {
  console.log(`🔧 Fixing Cloudflare Pages build configuration for ${PROJECT_NAME}\n`);
  
  try {
    // Get current project configuration
    console.log('1. Getting current project configuration...');
    const projectResponse = await makeRequest(
      'GET',
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}`
    );
    
    if (!projectResponse.success) {
      console.error('❌ Failed to get project:', projectResponse.errors);
      return;
    }
    
    console.log('✅ Current configuration:');
    console.log(`   Build command: ${projectResponse.result.build_config?.build_command || 'not set'}`);
    console.log(`   Build output: ${projectResponse.result.build_config?.destination_dir || 'not set'}`);
    console.log(`   Root directory: ${projectResponse.result.build_config?.root_dir || '/'}`);
    
    // Update configuration
    console.log('\n2. Updating build configuration...');
    const updateData = {
      build_config: {
        build_command: '',
        destination_dir: 'public',
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
            },
            SKIP_DEPENDENCY_INSTALL: {
              value: 'true',
              type: 'plain_text'
            }
          },
          compatibility_date: '2023-05-18',
          compatibility_flags: ['nodejs_compat'],
          node_compat: true
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
            },
            SKIP_DEPENDENCY_INSTALL: {
              value: 'true',
              type: 'plain_text'
            }
          },
          compatibility_date: '2023-05-18',
          compatibility_flags: ['nodejs_compat'],
          node_compat: true
        }
      }
    };
    
    const updateResponse = await makeRequest(
      'PATCH',
      `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}`,
      updateData
    );
    
    if (updateResponse.success) {
      console.log('✅ Build configuration updated successfully!');
      console.log('   Build command: (none - static files only)');
      console.log('   Build output: public');
      console.log('   Environment variables: Set');
      
      // Trigger new deployment
      console.log('\n3. Triggering new deployment...');
      const deployResponse = await makeRequest(
        'POST',
        `/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT_NAME}/deployments`
      );
      
      if (deployResponse.success) {
        console.log('✅ New deployment triggered!');
        console.log(`   Deployment ID: ${deployResponse.result.id}`);
        console.log(`   Preview URL: ${deployResponse.result.url}`);
        console.log('\n📌 Monitor deployment at:');
        console.log(`   https://dash.cloudflare.com/${ACCOUNT_ID}/pages/view/${PROJECT_NAME}`);
      } else {
        console.error('❌ Failed to trigger deployment:', deployResponse.errors);
      }
      
    } else {
      console.error('❌ Failed to update configuration:', updateResponse.errors);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixBuildConfiguration();