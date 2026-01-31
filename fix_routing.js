const https = require('https');
const config = require('./config.json');

const getOptions = {
  hostname: config.n8n.hostname,
  path: `/api/v1/workflows/${config.n8n.workflowId}`,
  method: 'GET',
  headers: {
    'X-N8N-API-KEY': config.n8n.apiKey,
    'accept': 'application/json'
  },
  rejectUnauthorized: false
};

const req = https.request(getOptions, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const workflow = JSON.parse(data);

    // Fix Route Module - reorder rules to match desired output order
    const routeNode = workflow.nodes.find(n => n.name === 'Route Module');
    if (routeNode) {
      routeNode.parameters = {
        rules: {
          values: [
            // Output 0: LIST_MODULES → Format Module List
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '1', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.action }}', rightValue: 'LIST_MODULES' }]
              },
              renameOutput: true,
              outputKey: 'List Modules'
            },
            // Output 1: UNKNOWN → Format Unknown
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '2', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.detectedModule }}', rightValue: 'UNKNOWN' }]
              },
              renameOutput: true,
              outputKey: 'Unknown'
            },
            // Output 2: CREATE → Handle Create
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [{ id: '3', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.action }}', rightValue: 'CREATE' }]
              },
              renameOutput: true,
              outputKey: 'Create'
            }
          ]
        },
        // Output 3 (fallback): READ → Fetch Zoho Data
        options: { fallbackOutput: 'extra' }
      };
      console.log('Fixed Route Module rules');
    }

    // Fix connections to match the new rule order
    workflow.connections['Route Module'] = {
      main: [
        [{ node: 'Format Module List', type: 'main', index: 0 }],   // Output 0: LIST_MODULES
        [{ node: 'Format Unknown', type: 'main', index: 0 }],       // Output 1: UNKNOWN
        [{ node: 'Handle Create', type: 'main', index: 0 }],        // Output 2: CREATE
        [{ node: 'Fetch Zoho Data', type: 'main', index: 0 }]       // Output 3: fallback (READ)
      ]
    };
    console.log('Fixed Route Module connections');

    // Update workflow
    const updateData = JSON.stringify({
      name: workflow.name,
      nodes: workflow.nodes,
      connections: workflow.connections,
      settings: workflow.settings
    });

    const putOptions = {
      hostname: config.n8n.hostname,
      path: `/api/v1/workflows/${config.n8n.workflowId}`,
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': config.n8n.apiKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(updateData)
      },
      rejectUnauthorized: false
    };

    const putReq = https.request(putOptions, putRes => {
      let putData = '';
      putRes.on('data', chunk => putData += chunk);
      putRes.on('end', () => {
        if (putRes.statusCode === 200) {
          console.log('SUCCESS: Routing fixed!');
          const actReq = https.request({
            hostname: config.n8n.hostname,
            path: `/api/v1/workflows/${config.n8n.workflowId}/activate`,
            method: 'POST',
            headers: { 'X-N8N-API-KEY': config.n8n.apiKey },
            rejectUnauthorized: false
          }, actRes => console.log('Activated:', actRes.statusCode === 200 ? 'SUCCESS' : 'Failed'));
          actReq.end();
        } else {
          console.log('Error:', putRes.statusCode, putData.substring(0, 500));
        }
      });
    });
    putReq.write(updateData);
    putReq.end();
  });
});
req.end();
