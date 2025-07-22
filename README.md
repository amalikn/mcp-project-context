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

## How It Works

The server implements the Model Context Protocol to provide Claude Code with tools for managing project context:

1. **Project Creation**: Initialize new projects with tech stack and current phase
2. **Context Retrieval**: Get comprehensive project state and history
3. **Task Management**: Create, update, and track development tasks
4. **Decision Recording**: Document important technical and architectural decisions
5. **Session Tracking**: Maintain continuity between development sessions
6. **Note Taking**: Capture important insights and observations

Data is stored as JSON files in a local `data` directory, making it easy to backup, version control, or inspect manually.

## Key Features

- **Persistent Context**: Project state survives between Claude Code sessions
- **Technology Stack Awareness**: Tracks your preferred technologies and tools
- **Task Prioritization**: Organize work with priority levels and status tracking
- **Decision Documentation**: Maintain architectural decision records (ADRs)
- **Session Goals**: Track what you planned vs what you achieved
- **File-Based Storage**: Simple JSON storage that's easy to understand and backup

## Prerequisites

- Node.js 18 or higher
- pnpm package manager
- Claude Code CLI tool

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

2. **Add your server configuration to `~/.claude/mcp.json`:**
```json
{
  "mcpServers": {
    "project-context": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/your/mcp-project-context"
    }
  }
}
```

Replace `/absolute/path/to/your/mcp-project-context` with the actual path to your project directory.

3. **Verify the configuration:**
```bash
cat ~/.claude/mcp.json
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

## Available Tools

The server provides these tools to Claude Code:

- `create_project` - Initialize a new project with tech stack and description
- `get_project_context` - Retrieve comprehensive project state and history
- `list_projects` - Show all projects ordered by last access
- `add_task` - Create new development tasks with priorities
- `update_task` - Modify task status, priority, or details
- `add_note` - Capture important observations and insights
- `record_decision` - Document architectural and technical decisions
- `start_session` - Begin a development session with specific goals

## Data Storage

Project data is stored in the `data` directory:

```
data/
├── projects/
│   ├── project-uuid-1.json
│   ├── project-uuid-2.json
│   └── project-uuid-3.json
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
cat ~/.claude/mcp.json
```

### Data Directory Issues

If you encounter permission errors, ensure the data directory exists and is writable:

```bash
mkdir -p data/projects data/sessions
chmod -R 755 data/
```

### Claude Code Logs

Check Claude Code logs for connection issues:

```bash
# The server logs errors to stderr, which Claude Code captures
# Check your terminal output when starting Claude Code
```

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
- **This Server**: Open an issue in this repository
