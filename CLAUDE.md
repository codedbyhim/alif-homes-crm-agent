# n8n Workflow Automation Project

This project uses n8n for workflow automation with AI-assisted development via Claude.

## Resources
- **n8n-mcp**: https://github.com/czlonkowski/n8n-mcp - MCP server for n8n (1,084 nodes, 2,709 templates)
- **n8n-skills**: https://github.com/czlonkowski/n8n-skills - Claude Code skills for n8n workflows

---

## MCP Tools Reference

### Core Tools (7)

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `tools_documentation` | Entry point - START HERE | None |
| `search_nodes` | Search node catalog | `query`, `source` (core/community/verified/all), `includeExamples` |
| `get_node` | Get node info | `nodeType`, `detail` (minimal/standard/full), `mode` (docs/search_properties/versions) |
| `validate_node` | Validate node config | `nodeType`, `config`, `profile` (minimal/runtime/ai-friendly/strict) |
| `validate_workflow` | Validate entire workflow | Workflow JSON object |
| `search_templates` | Find workflow templates | `searchMode` (keyword/by_nodes/by_task), `query`, `complexity` |
| `get_template` | Get template JSON | `templateId`, `mode` (nodes_only/structure/full) |

### n8n Management Tools (13) - Requires API Key

**Workflow Management:**
| Tool | Purpose |
|------|---------|
| `n8n_create_workflow` | Create new workflow |
| `n8n_get_workflow` | Retrieve workflow (modes: full/details/structure/minimal) |
| `n8n_update_full_workflow` | Complete workflow replacement |
| `n8n_update_partial_workflow` | Diff-based updates |
| `n8n_delete_workflow` | Delete workflow |
| `n8n_list_workflows` | List with filtering/pagination |
| `n8n_validate_workflow` | Validate deployed workflow by ID |
| `n8n_autofix_workflow` | Auto-correct common errors |

**Version & Execution:**
| Tool | Purpose |
|------|---------|
| `n8n_workflow_versions` | Version history and rollback |
| `n8n_deploy_template` | Deploy from n8n.io templates |
| `n8n_test_workflow` | Execute/test workflows |
| `n8n_executions` | List/get/delete executions |
| `n8n_health_check` | Verify API connectivity |

---

## Available Skills (Auto-Activate)

| Skill | When to Use |
|-------|-------------|
| `n8n-expression-syntax` | Writing `{{}}` expressions, `$json`, `$node`, `$now` variables |
| `n8n-mcp-tools-expert` | Choosing tools, nodeType formatting, validation profiles |
| `n8n-workflow-patterns` | Designing workflow architecture, webhook/API/AI patterns |
| `n8n-validation-expert` | Interpreting validation errors, fixing false positives |
| `n8n-node-configuration` | Property dependencies, operation-specific requirements |
| `n8n-code-javascript` | JavaScript in Code nodes, `$input`, `$helpers.httpRequest()` |
| `n8n-code-python` | Python in Code nodes (limited - no external libraries) |

---

## Development Guidelines

### Safety Rules
- **NEVER edit production workflows directly with AI**
- Always make a copy before AI modifications
- Test in development environment first
- Export backups of important workflows

### Validation Profiles
| Profile | Use Case |
|---------|----------|
| `minimal` | Quick syntax checks |
| `runtime` | Runtime behavior validation |
| `ai-friendly` | Balanced for AI workflow building |
| `strict` | Production-ready validation |

### Expression Syntax Quick Reference
```javascript
// Webhook data access (IMPORTANT: data is under body)
{{ $json.body.fieldName }}

// Previous node data
{{ $node["NodeName"].json.fieldName }}

// Current timestamp
{{ $now.toISO() }}

// Environment variables
{{ $env.MY_VAR }}
```

---

## Common Workflow Patterns

### 1. Webhook Processing
```
Webhook → Set/Code (transform) → IF (branch) → Action nodes → Respond to Webhook
```

### 2. HTTP API Integration
```
Trigger → HTTP Request → Code (parse) → Output node
```

### 3. AI Agent Workflow
```
Trigger → AI Agent → Tools (connected as AI tools) → Output
```
- Use `ai_tool` connection type for AI Agent tool connections
- 8 AI connection types available for different tool categories

### 4. Scheduled Tasks
```
Schedule Trigger → Fetch Data → Process → Notify/Store
```

### 5. Database Operations
```
Trigger → Query DB → Transform → Update DB → Confirm
```

---

## Quick Start Workflow

1. Use `search_nodes` to find needed nodes
2. Use `get_node` with `detail: "full"` for configuration details
3. Use `search_templates` to find similar workflows
4. Build workflow JSON structure
5. Use `validate_workflow` before deployment
6. Use `n8n_create_workflow` to deploy

---

## Configuration

For n8n API access, configure environment variables:
```
N8N_API_URL=https://your-n8n-instance.com
N8N_API_KEY=your-api-key
```
