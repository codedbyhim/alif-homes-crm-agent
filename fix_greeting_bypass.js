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

    // Add Check Direct Action switch node after Build Module Detection
    const checkDirectNode = {
      parameters: {
        rules: {
          values: [
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'or',
                conditions: [
                  { id: 'g1', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.action }}', rightValue: 'GREETING' },
                  { id: 'g2', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.action }}', rightValue: 'LIST_MODULES' }
                ]
              },
              renameOutput: true,
              outputKey: 'Direct'
            }
          ]
        },
        options: { fallbackOutput: 'extra' }
      },
      id: '41',
      name: 'Check Direct Action',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [900, 320]
    };

    // Check if node already exists
    const existingNode = workflow.nodes.find(n => n.name === 'Check Direct Action');
    if (!existingNode) {
      workflow.nodes.push(checkDirectNode);
      console.log('Added Check Direct Action node');
    } else {
      existingNode.parameters = checkDirectNode.parameters;
      console.log('Updated existing Check Direct Action node');
    }

    // Move Detect Module AI position
    const detectAI = workflow.nodes.find(n => n.name === 'Detect Module AI');
    if (detectAI) {
      detectAI.position = [1008, 420]; // Move down slightly
    }

    // Update connections - Build Module Detection now goes to Check Direct Action
    workflow.connections['Build Module Detection'] = {
      main: [[{ node: 'Check Direct Action', type: 'main', index: 0 }]]
    };

    // Check Direct Action routes:
    // Output 0 (Direct - GREETING/LIST_MODULES) -> Route Module
    // Output 1 (fallback - needs AI) -> Detect Module AI
    workflow.connections['Check Direct Action'] = {
      main: [
        [{ node: 'Route Module', type: 'main', index: 0 }],  // Direct actions bypass AI
        [{ node: 'Detect Module AI', type: 'main', index: 0 }]  // Others go to AI
      ]
    };

    console.log('Updated connections');

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
          console.log('SUCCESS: Greeting bypass added!');
          // Activate workflow
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
