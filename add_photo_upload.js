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

    // Update Telegram Trigger to also receive photos
    const telegramTrigger = workflow.nodes.find(n => n.name === 'Telegram Trigger');
    if (telegramTrigger) {
      telegramTrigger.parameters.updates = ['message', 'photo'];
      console.log('Updated Telegram Trigger to receive photos');
    }

    // Update From Telegram to detect photo and extract file_id
    const fromTelegram = workflow.nodes.find(n => n.name === 'From Telegram');
    if (fromTelegram) {
      fromTelegram.parameters.jsCode = `const msg = $input.first().json.message || {};
const chatInput = msg.text || msg.caption || '';
const chatId = msg.chat?.id || msg.from?.id;

// Check if message has a photo
const photo = msg.photo;
let photoFileId = null;
if (photo && photo.length > 0) {
  // Get the largest photo (last in array)
  photoFileId = photo[photo.length - 1].file_id;
}

return [{ json: { chatInput, source: 'telegram', chatId, hasPhoto: !!photoFileId, photoFileId } }];`;
      console.log('Updated From Telegram to detect photos');
    }

    // Add Check Photo node after Merge Input
    const checkPhotoNode = {
      parameters: {
        rules: {
          values: [
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [
                  { id: 'p1', operator: { type: 'boolean', operation: 'true' }, leftValue: '={{ $json.hasPhoto }}' }
                ]
              },
              renameOutput: true,
              outputKey: 'Has Photo'
            }
          ]
        },
        options: { fallbackOutput: 'extra' }
      },
      id: '50',
      name: 'Check Photo',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [500, 320]
    };

    // Add Get Photo File node - gets file path from Telegram
    const getPhotoFileNode = {
      parameters: {
        url: '=https://api.telegram.org/bot{{ $credentials.telegramApi.accessToken }}/getFile?file_id={{ $json.photoFileId }}',
        authentication: 'none',
        options: {}
      },
      id: '51',
      name: 'Get Photo File',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [600, 160]
    };

    // Add Download Photo node
    const downloadPhotoNode = {
      parameters: {
        url: '=https://api.telegram.org/file/bot{{ $credentials.telegramApi.accessToken }}/{{ $json.result.file_path }}',
        authentication: 'none',
        options: {
          response: {
            response: {
              responseFormat: 'file'
            }
          }
        }
      },
      id: '52',
      name: 'Download Photo',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [800, 160]
    };

    // Add Process Photo with Vision node
    const processPhotoNode = {
      parameters: {
        jsCode: `const photoData = $input.first().binary.data;
const prevData = $('Check Photo').first().json;
const chatId = prevData.chatId;
const caption = prevData.chatInput || '';

// Convert binary to base64
const base64Image = photoData.data;
const mimeType = photoData.mimeType || 'image/jpeg';

const systemPrompt = \`You are Alif Homes data extraction assistant. Extract data from this form/document image.

MODULES YOU CAN CREATE RECORDS IN:
1. Bookings - Guest bookings (fields: Guest_Name, Unit, Check_In, Check_Out, Amount, Commission, Status)
2. Guests_Database - Guest info (fields: Name, Nationality, Passport_Number, Phone, Email)
3. Tenants - Long-term tenants (fields: Name, Phone, Email, Unit, Lease_Start, Lease_End)
4. Monthly_Rent - Rent payments (fields: Tenant, Amount, Month, Status, Payment_Date)
5. Unit_Owner_Database - Property owners (fields: Name, Phone, Email, Units, Payout_Method)

INSTRUCTIONS:
1. Look at the image carefully
2. Identify what type of form/document it is
3. Extract ALL visible data fields
4. Determine which Zoho module this data belongs to
5. Return JSON with the extracted data

RETURN FORMAT:
{
  "module": "Module_Name",
  "action": "CREATE",
  "data": {
    "Field1": "value1",
    "Field2": "value2"
  },
  "summary": "Brief description of what was extracted"
}

If you cannot read the image clearly, return:
{
  "module": "UNKNOWN",
  "action": "ERROR",
  "error": "Description of the problem"
}

IMPORTANT: Use KES for currency. Dates should be YYYY-MM-DD format.\`;

const requestBody = JSON.stringify({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: caption ? 'Additional context: ' + caption : 'Please extract data from this form/document.' },
        { type: 'image_url', image_url: { url: 'data:' + mimeType + ';base64,' + base64Image } }
      ]
    }
  ],
  max_tokens: 1500,
  temperature: 0.1
});

return [{ json: { requestBody, chatId, source: 'telegram' } }];`
      },
      id: '53',
      name: 'Process Photo',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1000, 160]
    };

    // Add Call Vision AI node
    const callVisionNode = {
      parameters: {
        method: 'POST',
        url: 'https://api.openai.com/v1/chat/completions',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ $json.requestBody }}',
        options: {}
      },
      id: '54',
      name: 'Call Vision AI',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1200, 160],
      credentials: {
        httpHeaderAuth: {
          id: '41PFYbdJUDhDEJrm',
          name: 'Header Auth account'
        }
      }
    };

    // Add Parse Vision Response node
    const parseVisionNode = {
      parameters: {
        jsCode: `const prev = $('Process Photo').first().json;
const aiRes = $input.first().json;
const chatId = prev.chatId;
const source = prev.source;

let parsed = { module: 'UNKNOWN', action: 'ERROR', error: 'Could not parse response' };
try {
  const content = aiRes.choices[0].message.content.trim();
  const jsonMatch = content.match(/\\{[\\s\\S]*\\}/);
  if (jsonMatch) {
    parsed = JSON.parse(jsonMatch[0]);
  }
} catch(e) {
  parsed = { module: 'UNKNOWN', action: 'ERROR', error: 'Failed to parse AI response: ' + e.message };
}

return [{ json: { ...parsed, chatId, source } }];`
      },
      id: '55',
      name: 'Parse Vision Response',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1400, 160]
    };

    // Add Check Vision Result node
    const checkVisionNode = {
      parameters: {
        rules: {
          values: [
            {
              conditions: {
                options: { version: 2, caseSensitive: true, leftValue: '', typeValidation: 'strict' },
                combinator: 'and',
                conditions: [
                  { id: 'v1', operator: { type: 'string', operation: 'equals' }, leftValue: '={{ $json.action }}', rightValue: 'CREATE' }
                ]
              },
              renameOutput: true,
              outputKey: 'Create'
            }
          ]
        },
        options: { fallbackOutput: 'extra' }
      },
      id: '56',
      name: 'Check Vision Result',
      type: 'n8n-nodes-base.switch',
      typeVersion: 3.2,
      position: [1600, 160]
    };

    // Add Create From Photo node
    const createFromPhotoNode = {
      parameters: {
        method: 'POST',
        url: '=https://www.zohoapis.com/crm/v2/{{ $json.module }}',
        authentication: 'predefinedCredentialType',
        nodeCredentialType: 'zohoOAuth2Api',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify({ "data": [$json.data] }) }}',
        options: {
          response: {
            response: {
              neverError: true
            }
          }
        }
      },
      id: '57',
      name: 'Create From Photo',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: [1800, 80],
      credentials: {
        zohoOAuth2Api: {
          id: 'x7W9mTyq5hIWwhtu',
          name: 'Zoho account'
        }
      }
    };

    // Add Format Photo Create Response node
    const formatPhotoCreateNode = {
      parameters: {
        jsCode: `const prev = $('Parse Vision Response').first().json;
const res = $input.first().json;
const chatId = prev.chatId;
const source = prev.source;
const module = (prev.module || '').replace(/_/g, ' ');
const summary = prev.summary || '';

let output = '';
if (res.data && res.data[0] && res.data[0].status === 'success') {
  output = 'Successfully created record from your photo!\\n\\n' +
    'Module: ' + module + '\\n' +
    'Record ID: ' + res.data[0].details.id + '\\n\\n' +
    (summary ? 'Extracted: ' + summary : '');
} else if (res.code) {
  output = 'Error creating record: ' + (res.message || res.code) + '\\n\\nPlease check if all required fields were in the photo.';
} else {
  output = 'Record creation attempted. Please check Zoho CRM to verify.\\n\\n' + (summary ? 'Extracted: ' + summary : '');
}

return [{ json: { output, source, chatId } }];`
      },
      id: '58',
      name: 'Format Photo Create',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [2000, 80]
    };

    // Add Format Photo Error node
    const formatPhotoErrorNode = {
      parameters: {
        jsCode: `const input = $input.first().json;
const chatId = input.chatId;
const source = input.source;
const error = input.error || input.summary || 'Could not process the image';

let output = '';
if (input.module === 'UNKNOWN') {
  output = "I couldn't understand the form in your photo.\\n\\n" +
    "Please make sure:\\n" +
    "1. The photo is clear and well-lit\\n" +
    "2. All text is readable\\n" +
    "3. It's a form I recognize (booking, guest, tenant, rent, owner)\\n\\n" +
    "You can also add a caption to help, like: 'This is a booking form'";
} else {
  output = 'Error processing photo: ' + error;
}

return [{ json: { output, source, chatId } }];`
      },
      id: '59',
      name: 'Format Photo Error',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [1800, 240]
    };

    // Add all new nodes
    const newNodes = [checkPhotoNode, getPhotoFileNode, downloadPhotoNode, processPhotoNode, callVisionNode, parseVisionNode, checkVisionNode, createFromPhotoNode, formatPhotoCreateNode, formatPhotoErrorNode];

    for (const node of newNodes) {
      const existing = workflow.nodes.find(n => n.name === node.name);
      if (!existing) {
        workflow.nodes.push(node);
        console.log('Added node: ' + node.name);
      } else {
        existing.parameters = node.parameters;
        existing.position = node.position;
        console.log('Updated node: ' + node.name);
      }
    }

    // Update Merge Input position
    const mergeInput = workflow.nodes.find(n => n.name === 'Merge Input');
    if (mergeInput) {
      mergeInput.position = [400, 320];
    }

    // Update Get All Modules position
    const getAllModules = workflow.nodes.find(n => n.name === 'Get All Modules');
    if (getAllModules) {
      getAllModules.position = [700, 420];
    }

    // Update connections
    // Merge Input -> Check Photo
    workflow.connections['Merge Input'] = {
      main: [[{ node: 'Check Photo', type: 'main', index: 0 }]]
    };

    // Check Photo: Has Photo -> Get Photo File, No Photo -> Get All Modules
    workflow.connections['Check Photo'] = {
      main: [
        [{ node: 'Get Photo File', type: 'main', index: 0 }],
        [{ node: 'Get All Modules', type: 'main', index: 0 }]
      ]
    };

    // Photo processing chain
    workflow.connections['Get Photo File'] = {
      main: [[{ node: 'Download Photo', type: 'main', index: 0 }]]
    };

    workflow.connections['Download Photo'] = {
      main: [[{ node: 'Process Photo', type: 'main', index: 0 }]]
    };

    workflow.connections['Process Photo'] = {
      main: [[{ node: 'Call Vision AI', type: 'main', index: 0 }]]
    };

    workflow.connections['Call Vision AI'] = {
      main: [[{ node: 'Parse Vision Response', type: 'main', index: 0 }]]
    };

    workflow.connections['Parse Vision Response'] = {
      main: [[{ node: 'Check Vision Result', type: 'main', index: 0 }]]
    };

    workflow.connections['Check Vision Result'] = {
      main: [
        [{ node: 'Create From Photo', type: 'main', index: 0 }],
        [{ node: 'Format Photo Error', type: 'main', index: 0 }]
      ]
    };

    workflow.connections['Create From Photo'] = {
      main: [[{ node: 'Format Photo Create', type: 'main', index: 0 }]]
    };

    workflow.connections['Format Photo Create'] = {
      main: [[{ node: 'Route Output', type: 'main', index: 0 }]]
    };

    workflow.connections['Format Photo Error'] = {
      main: [[{ node: 'Route Output', type: 'main', index: 0 }]]
    };

    console.log('Updated all connections');

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
          console.log('SUCCESS: Photo upload feature added!');
          const actReq = https.request({
            hostname: config.n8n.hostname,
            path: `/api/v1/workflows/${config.n8n.workflowId}/activate`,
            method: 'POST',
            headers: { 'X-N8N-API-KEY': config.n8n.apiKey },
            rejectUnauthorized: false
          }, actRes => console.log('Activated:', actRes.statusCode === 200 ? 'SUCCESS' : 'Failed'));
          actReq.end();
        } else {
          console.log('Error:', putRes.statusCode, putData.substring(0, 1000));
        }
      });
    });
    putReq.write(updateData);
    putReq.end();
  });
});
req.end();
