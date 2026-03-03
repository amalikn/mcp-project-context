# MCP Project Context Server

A Model Context Protocol (MCP) server that provides persistent project context and planning state between Claude Code sessions. This eliminates the need to re-explain project details, current status, and development context every time you start a new coding session.

## What It Does

The MCP Project Context Server acts as a persistent memory layer for your development projects, maintaining:

- **Project Information**: Name, description, current phase, and status
- **Technology Stack**: Frontend, backend, database, infrastructure, and tooling choices
- **Task Management**: Development tasks with priorities, status tracking, and dependencies
- **Decision History**: Architectural and technical decisions with reasoning
- **Session Continuity**: Goals, achievements, and blockers from previous sessions
- **Development Notes**: Important observations and insights

## Single Source of Truth Paths

Use these canonical paths for local multi-client setups (Claude + Codex):

- `mcp-project-context` repo: `<MCP_BASE>/mcp-project-context`
- Shared project data dir: `<MCP_DATA_BASE>/mcp-project-context/data`
- Server entrypoint: `<MCP_BASE>/mcp-project-context/dist/index.js`

Recommended launch pattern:

```bash
bash -lc 'mkdir -p <MCP_DATA_BASE>/mcp-project-context/data && cd <MCP_DATA_BASE>/mcp-project-context && exec node <MCP_BASE>/mcp-project-context/dist/index.js'
```

Change Once Checklist:

- Update Claude user-scope server command: `claude mcp add-json -s user mcp-project-context ...`
- Update Codex user config: `~/.codex/config.toml` under `[mcp_servers.mcp-project-context]`
- Verify with:
  - `claude mcp get mcp-project-context`
  - `codex mcp get mcp-project-context`
- Confirm active data directory:
  - `ps aux | rg "mcp-project-context|dist/index.js" | rg -v rg`
  - server working dir should be `<MCP_DATA_BASE>/mcp-project-context`

Path placeholders and example values:

- `<MCP_BASE>` = <path-to-mcp-repos> (example: `/Volumes/Data/_ai/_mcp/mcp_stuff`)
- `<MCP_DATA_BASE>` = <path-to-mcp-data-root> (example: `/Volumes/Data/_ai/mcp-data`)

## How It Works

The server implements the Model Context Protocol to provide Claude Code with tools for managing project context:

1. **Project Creation**: Initialize new projects with tech stack and current phase
2. **Context Retrieval**: Get comprehensive project state and history
3. **Task Management**: Create, update, and track development tasks
4. **Decision Recording**: Document important technical and architectural decisions
5. **Session Tracking**: Maintain continuity between development sessions
6. **Note Taking**: Capture important insights and observations

Data is stored as JSON files in a `data` directory relative to the server working directory. This makes it easy to backup, version control, or inspect manually.

## Key Features

- **Persistent Context**: Project state survives between Claude Code sessions
- **Technology Stack Awareness**: Tracks your preferred technologies and tools
- **Task Prioritization**: Organize work with priority levels and status tracking
- **Decision Documentation**: Maintain architectural decision records (ADRs)
- **Session Goals**: Track what you planned vs what you achieved
- **File-Based Storage**: Simple JSON storage that's easy to understand and backup

## Enhancements Implemented (High & Medium ROI)

### High ROI Enhancements

- **Real Session Finalization**
  - `end_session` now persists `endTime`, `achievements`, `blockers`, and `nextSession`.
  - Optional safety guard: `safeMode` + `force` confirmation.

- **Checkpoint Workflow**
  - `create_checkpoint` snapshots project + optional sessions.
  - `list_checkpoints` lists available checkpoints with IDs and timestamps.
  - `restore_checkpoint` restores by checkpoint ID.
  - `restore_latest_checkpoint` restores newest checkpoint automatically.
  - `delete_checkpoint` supports safe deletion and requires `force: true`.

- **Advanced Context Retrieval**
  - `get_project_context` now supports: section filtering, channel filtering, category filtering, status/priority filtering, date filters, regex matching, sort, limit, and offset.
  - Response is token-budget aware and truncates safely when output is too large.

### Medium ROI Enhancements

- **Channels**
  - Tasks, notes, decisions, and sessions can be organized by channel.
  - `list_channels` shows per-channel counts.
  - `start_session` can derive channel from git branch (`deriveChannelFromGit` + `projectDir`).

- **File Change Tracking**
  - `cache_file` stores hash + size + timestamp for file snapshots.
  - `file_changed` compares current content against cached hash.
  - File-cache entries are persisted in `<DATA_DIR>/file-cache`.

- **Consistent Safety Guards**
  - Shared safety confirmation behavior is used for `end_session`, `restore_checkpoint`, `restore_latest_checkpoint`, and `delete_checkpoint`.

- **Tool Profiles (Context Overhead Control)**
  - Server supports `TOOL_PROFILE=minimal|standard|full`.
  - `minimal` exposes only core planning/session/checkpoint tools.
  - `standard` adds channels + file tracking + restore/list flows.
  - `full` exposes all available tools (default).

## Prerequisites

- Node.js 18 or higher
- pnpm package manager
- Claude Code CLI tool and/or OpenAI Codex CLI

## Installation

1. **Clone and setup the project:**
```bash
git clone <repository-url>
cd mcp-project-context
pnpm install
```

2. **Build the server:**
```bash
pnpm run build
```

3. **Make the server executable:**
```bash
chmod +x dist/index.js
```

## Configuration

### Claude Code Setup

1. **Create or edit the Claude Code MCP configuration file:**
```bash
mkdir -p ~/.claude
```

2. **Add your server configuration to `~/.claude.json`:**
```json
{
    "mcpServers": {
      "mcp-project-context": {
        "type": "stdio",
        "command": "/path/to/mcp-project-context/dist/index.js",
        "args": [],
        "env": {}
      }
    }
}
```

Replace `/absolute/path/to/your/mcp-project-context` with the actual path to your project directory.

### Token Safety Configuration

`get_project_context` uses token-aware response limiting. You can tune it with environment variables:

- `MCP_MAX_TOKENS` (default: `25000`)
- `MCP_TOKEN_SAFETY_BUFFER` (default: `0.8`)
- `MCP_CHARS_PER_TOKEN` (default: `3.5`)

Example:

```json
{
  "mcpServers": {
    "mcp-project-context": {
      "type": "stdio",
      "command": "/path/to/mcp-project-context/dist/index.js",
      "args": [],
      "env": {
        "MCP_MAX_TOKENS": "20000",
        "MCP_TOKEN_SAFETY_BUFFER": "0.75",
        "MCP_CHARS_PER_TOKEN": "3.2"
      }
    }
  }
}
```

### Tool Profile Configuration

To reduce MCP tool noise in Claude, set `TOOL_PROFILE` in your MCP config environment:

- `minimal` - smallest working set for core planning workflows
- `standard` - balanced set for daily development
- `full` - all tools (default)

Example (`standard` profile):

```json
{
  "mcpServers": {
    "mcp-project-context": {
      "type": "stdio",
      "command": "/path/to/mcp-project-context/dist/index.js",
      "args": [],
      "env": {
        "TOOL_PROFILE": "standard"
      }
    }
  }
}
```

If `TOOL_PROFILE` is unknown, the server logs a warning and falls back to `full`.
`TOOL_PROFILE` changes are applied at server startup, so restart the MCP server after config updates.

Use `tool_profile_status` to see the currently active profile and enabled tools.
Use `set_tool_profile` to get guided instructions for switching profiles in config.
Use `tool_profile_snippets` to get paste-ready env snippets for all profiles.

3. **Verify the configuration:**
```bash
cat ~/.claude.json
```

#### Recommended shared data directory (Claude + Codex)

To share the same project context across both tools, run the server from a shared working directory:

`<MCP_DATA_BASE>/mcp-project-context`

Example user-scope command:

```bash
claude mcp add -s user mcp-project-context -- \
  bash -lc 'mkdir -p <MCP_DATA_BASE>/mcp-project-context/data && cd <MCP_DATA_BASE>/mcp-project-context && exec node <MCP_BASE>/mcp-project-context/dist/index.js'
```

### OpenAI Codex CLI Setup

1. **Add MCP server to Codex (global):**

```bash
codex mcp add mcp-project-context bash -lc 'mkdir -p <MCP_DATA_BASE>/mcp-project-context/data && cd <MCP_DATA_BASE>/mcp-project-context && exec node <MCP_BASE>/mcp-project-context/dist/index.js'
```

2. **(Optional) Add with environment variables (example: profile + token safety):**

```bash
codex mcp add mcp-project-context \
  --env TOOL_PROFILE=standard \
  bash -lc 'mkdir -p <MCP_DATA_BASE>/mcp-project-context/data && cd <MCP_DATA_BASE>/mcp-project-context && exec node <MCP_BASE>/mcp-project-context/dist/index.js'
```

3. **Verify Codex MCP registration:**

```bash
codex mcp list
codex mcp get mcp-project-context
```

4. **Update or remove server if needed:**

```bash
codex mcp remove mcp-project-context
```

Then add it again with your updated command/env.

5. **Future project-scoped setup (when supported by Codex):**

At the time of writing, Codex MCP management is global (`codex mcp add ...`).
If Codex introduces project-scoped MCP registration in a future release, prefer project scope for team/repo-local reproducibility.

Suggested future pattern:

```bash
# Example placeholder (check `codex mcp add --help` for actual flags once released)
codex mcp add --scope project mcp-project-context /absolute/path/to/mcp-project-context/scripts/run-mcp.sh
```

## Usage

Once configured, Claude Code will automatically start and connect to your MCP server. You can then use natural language to interact with your project context:

### Example Commands

**Create a new project:**
```
"Create a new project called 'E-commerce Platform' for building a modern online store using Next.js, Node.js, PostgreSQL, and Docker"
```

**Get current project status:**
```
"What's the current status of my project? Where did we leave off?"
```

**Add development tasks:**
```
"Add a high-priority task to implement user authentication with OAuth"
```

**Record architectural decisions:**
```
"Record that we decided to use Prisma as our ORM because it provides better TypeScript support and easier migrations"
```

**Update task status:**
```
"Mark the authentication task as completed"
```

**Add project notes:**
```
"Add a note that the API rate limiting is causing issues in development"
```

**Channel-focused session start:**
```
"Start a session for project <projectId> with goals ['finish auth middleware'] and derive channel from git for /path/to/repo"
```

**Checkpoint safety flow:**
```
"Create checkpoint 'before-auth-refactor' for project <projectId>"
"List checkpoints for project <projectId>"
"Restore latest checkpoint for project <projectId> with safe mode and force true"
```

**File change tracking:**
```
"Cache file /src/auth.ts with its current contents"
"Check if /src/auth.ts changed using current contents"
```

## Available Tools

### Tool Profiles & Introspection

- `tool_profile_status`
  - **Use for**: checking which profile is active and exactly which tools are enabled.
  - **Input**: none.

- `set_tool_profile`
  - **Use for**: getting guided instructions to switch `TOOL_PROFILE` in MCP config.
  - **Input**: `profile` (`minimal` | `standard` | `full`).
  - **Notes**: returns instructions only; restart is required after config update.

- `tool_profile_snippets`
  - **Use for**: getting paste-ready env snippets for all profiles.
  - **Input**: none.

### Project Context

- `create_project`
  - **Use for**: creating a new project container.
  - **Input**: `name`, `description`, `currentPhase`, optional `techStack`.

- `get_project_context`
  - **Use for**: retrieving project context with optional filtering.
  - **Required input**: `projectId`.
  - **Optional filters**: `section`, `channel`, `category`, `taskStatus`, `taskPriority`, `createdAfter`, `createdBefore`, `sort`, `limit`, `offset`, `keyPattern`.
  - **Notes**: output is token-budget aware and may be truncated with a notice.

- `list_projects`
  - **Use for**: listing all projects ordered by last access.
  - **Input**: none.

### Channels

- `list_channels`
  - **Use for**: viewing channel activity and counts.
  - **Input**: `projectId`.
  - **Returns**: per-channel task/note/decision/session counts.

### Tasks, Notes, Decisions

- `add_task`
  - **Use for**: adding a task with planning metadata.
  - **Input**: `projectId`, `title`, `priority`, optional `description`, `tags`, `channel`.

- `update_task`
  - **Use for**: changing task status/details.
  - **Input**: `projectId`, `taskId`, optional `status`, `title`, `description`, `priority`.

- `add_note`
  - **Use for**: storing project notes.
  - **Input**: `projectId`, `content`, optional `category`, `channel`.

- `record_decision`
  - **Use for**: recording technical/architectural decisions.
  - **Input**: `projectId`, `decision`, `reasoning`, optional `impact`, `channel`.

### File Change Tracking

- `cache_file`
  - **Use for**: caching file hash/size snapshot.
  - **Input**: `filePath`, `content`.

- `file_changed`
  - **Use for**: checking whether content diverged from cached hash.
  - **Input**: `filePath`, optional `currentContent`.

### Sessions

- `start_session`
  - **Use for**: creating a development session scope.
  - **Input**: `projectId`, `goals`, optional `channel`, `projectDir`, `deriveChannelFromGit`.
  - **Notes**: when `deriveChannelFromGit=true`, channel is inferred from git branch.

- `end_session`
  - **Use for**: finalizing a session and saving summary.
  - **Input**: `sessionId`, optional `achievements`, `blockers`, `nextSession`, `safeMode`, `force`.
  - **Safety**: if `safeMode=true`, set `force=true` to proceed.

### Checkpoints

- `create_checkpoint`
  - **Use for**: snapshotting project state before major changes.
  - **Input**: `projectId`, `name`, optional `description`, `includeSessions`.

- `list_checkpoints`
  - **Use for**: listing saved checkpoints.
  - **Input**: `projectId`, optional `limit`.

- `restore_checkpoint`
  - **Use for**: restoring from a specific checkpoint ID.
  - **Input**: `checkpointId`, optional `restoreSessions`, `safeMode`, `force`.
  - **Safety**: if `safeMode=true`, set `force=true` to proceed.

- `restore_latest_checkpoint`
  - **Use for**: restoring the newest checkpoint for a project.
  - **Input**: `projectId`, optional `restoreSessions`, `safeMode`, `force`.
  - **Safety**: if `safeMode=true`, set `force=true` to proceed.

- `delete_checkpoint`
  - **Use for**: deleting a checkpoint permanently.
  - **Input**: `checkpointId`, `force`.
  - **Safety**: requires `force=true`.

### Quick Cheat Sheet

| Command | Required Inputs | Common Optional Inputs |
| --- | --- | --- |
| `tool_profile_status` | — | — |
| `set_tool_profile` | `profile` | — |
| `tool_profile_snippets` | — | — |
| `create_project` | `name`, `description`, `currentPhase` | `techStack` |
| `get_project_context` | `projectId` | `section`, `channel`, `category`, `taskStatus`, `taskPriority`, `createdAfter`, `createdBefore`, `sort`, `limit`, `offset`, `keyPattern` |
| `list_projects` | — | — |
| `list_channels` | `projectId` | — |
| `add_task` | `projectId`, `title`, `priority` | `description`, `tags`, `channel` |
| `update_task` | `projectId`, `taskId` | `status`, `title`, `description`, `priority` |
| `add_note` | `projectId`, `content` | `category`, `channel` |
| `record_decision` | `projectId`, `decision`, `reasoning` | `impact`, `channel` |
| `cache_file` | `filePath`, `content` | — |
| `file_changed` | `filePath` | `currentContent` |
| `start_session` | `projectId`, `goals` | `channel`, `projectDir`, `deriveChannelFromGit` |
| `end_session` | `sessionId` | `achievements`, `blockers`, `nextSession`, `safeMode`, `force` |
| `create_checkpoint` | `projectId`, `name` | `description`, `includeSessions` |
| `list_checkpoints` | `projectId` | `limit` |
| `restore_checkpoint` | `checkpointId` | `restoreSessions`, `safeMode`, `force` |
| `restore_latest_checkpoint` | `projectId` | `restoreSessions`, `safeMode`, `force` |
| `delete_checkpoint` | `checkpointId`, `force` | — |

## Data Storage

Project data is stored in the `data` directory:

```
data/
├── projects/
│   ├── project-uuid-1.json
│   ├── project-uuid-2.json
│   └── project-uuid-3.json
├── checkpoints/
│   ├── checkpoint-uuid-1.json
│   ├── checkpoint-uuid-2.json
│   └── checkpoint-uuid-3.json
├── file-cache/
│   ├── encoded-file-1.json
│   ├── encoded-file-2.json
│   └── encoded-file-3.json
└── sessions/
    ├── session-uuid-1.json
    ├── session-uuid-2.json
    └── session-uuid-3.json
```

Each file contains structured JSON data that you can inspect or backup as needed.

## Development

### Project Structure

```
mcp-project-context/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # MCP server implementation
│   ├── storage/
│   │   ├── project-store.ts  # File-based storage layer
│   │   └── context-manager.ts # Context management logic
│   └── types/
│       └── project-types.ts  # TypeScript type definitions
├── data/                     # Project data storage
├── package.json
├── tsconfig.json
└── README.md
```

### Available Scripts

- `pnpm run build` - Compile TypeScript to JavaScript
- `pnpm run start` - Run the compiled server
- `pnpm run dev` - Run in development mode with auto-reload

### Testing the Server

You can test the server manually:

```bash
# Start the server directly
node dist/index.js

# The server will wait for MCP protocol messages via stdin
```

For interactive testing, use the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Troubleshooting

### Server Connection Issues

1. **Verify the server builds successfully:**
```bash
pnpm run build
```

2. **Check that the executable bit is set:**
```bash
ls -la dist/index.js
chmod +x dist/index.js
```

3. **Test the server manually:**
```bash
node dist/index.js
```

4. **Verify Claude Code configuration:**
```bash
cat ~/.claude.json
```

### Data Directory Issues

If you encounter permission errors, ensure the data directory exists and is writable (example shared path):

```bash
mkdir -p <MCP_DATA_BASE>/mcp-project-context/data/{projects,sessions,checkpoints,file-cache}
chmod -R 755 <MCP_DATA_BASE>/mcp-project-context/data
```

### Timestamp Timezone Behavior (Local PC)

Project Context now writes timestamps in local machine timezone with explicit offset
(for example `2026-03-03T20:56:57.739+11:00`) instead of UTC `Z` format.
Mixed historical formats (`...Z` and `...+HH:MM`) are both parseable for filtering/sorting,
but migrating keeps data uniform and easier to reason about.

If you need to migrate existing JSON data to this format:

```bash
# Default data path: ./data
npm run migrate:timestamps:local

# Preview only (no writes)
node scripts/migrate-timestamps-local.mjs --dry-run

# Or specify explicit data directory
node scripts/migrate-timestamps-local.mjs /absolute/path/to/mcp-project-context/data

# Preview explicit directory (no writes)
node scripts/migrate-timestamps-local.mjs /absolute/path/to/mcp-project-context/data --dry-run
```

If you move to a different timezone, existing entries keep their stored offset values
and new entries use the new local offset. This is normal; if you want a full
re-localization to the new timezone representation, run the migration again.

### Claude Code Logs

Check Claude Code logs for connection issues:

```bash
# The server logs errors to stderr, which Claude Code captures
# Check your terminal output when starting Claude Code
```

## Post-Install Verification Checklist

Use this checklist after setup to verify the MCP server is exposing all features.

### 1) Restart + Connectivity

1. Restart Claude Code (or start a new session) so MCP tools refresh.
2. Verify server is running:

```bash
claude mcp list
```

3. If your MCP command uses `dist/index.js`, rebuild first:

```bash
npm run build
```

If your MCP command uses `scripts/run-mcp.sh`, rebuild is not required.

### 2) Profile Tools

1. Run `tool_profile_status` and confirm:
   - active profile
   - enabled tool count
   - enabled tool list
2. Run `tool_profile_snippets` and confirm snippets for `minimal`, `standard`, and `full`.
3. (Optional) Run `set_tool_profile` and verify it returns env update + restart instructions.

### 3) Core Context + Channels

1. Run `create_project`.
2. Run `start_session` with either:
   - explicit `channel`, or
   - `deriveChannelFromGit: true` + `projectDir`.
3. Add channel-tagged data:
   - `add_task`
   - `add_note`
   - `record_decision`
4. Run `list_channels` and confirm counts update.

### 4) Checkpoint Safety Flow

1. Run `create_checkpoint`.
2. Run `list_checkpoints`.
3. Run `restore_latest_checkpoint` with `safeMode: true` and no `force` (should block).
4. Retry with `force: true` (should restore).
5. Run `delete_checkpoint` without `force` (should block), then with `force: true` (should delete).

### 5) File Cache + Change Detection

1. Run `cache_file` with `filePath` and `content`.
2. Run `file_changed` with same content (expect `changed: false`).
3. Run `file_changed` with modified content (expect `changed: true`).

### 6) Filtered Context + Token Safety

1. Run `get_project_context` with filters (e.g. `section`, `channel`, `limit`, `sort`).
2. For large outputs, confirm truncation notice appears:
   - `## Response Notice`
   - token safety/truncation message

If any step fails, capture the tool response and inspect Claude output logs.

For a condensed quick-run version, see `scripts/smoke-checklist.md`.

## Multi-Client Usage (Claude + Codex + Others)

Yes — the same project context can be shared across multiple AI tools, as long as they point to the same MCP server/data directory.

- Shared data location in this setup: `<MCP_DATA_BASE>/mcp-project-context/data`
- Shared entities: projects, tasks, notes, decisions, sessions, checkpoints, and file-cache

### Best Practices

- Prefer one primary writer at a time for large operations (checkpoint restore/delete, bulk updates).
- Keep `safeMode` + `force` enabled for state-altering operations to reduce accidental changes.
- Use channels to separate workflows by tool/session/topic.
- Create checkpoints before major edits when switching between tools.

### Concurrency Note

This implementation uses JSON file storage (not transactional DB locking). Concurrent heavy writes from multiple clients may overwrite each other if they occur at the same time.

## Privacy and Data

- All project data is stored locally on your machine
- No data is transmitted to external services
- JSON files can be easily backed up or version controlled
- Each developer/machine maintains separate project contexts

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues related to:
- **MCP Protocol**: See [Model Context Protocol documentation](https://modelcontextprotocol.io/)
- **Claude Code**: See [Claude Code documentation](https://docs.anthropic.com/en/docs/claude-code)
- **READ THE DOCS**: See [official TS SDK for MCP](https://github.com/modelcontextprotocol/typescript-sdk)
- **This Server**: Open an issue in this repository
