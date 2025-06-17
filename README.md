# Console MCP Server

A Model Context Protocol (MCP) server that provides a bridge between external console processes and Copilot through log file search capabilities.

## Overview

This project consists of two main components:

1. **Console Logger** (`console-logger`) - A utility that wraps any command and captures its stdout/stderr output to structured JSON log files
2. **MCP Server** (`console-mcp`) - Provides search tools to analyze these logs through Copilot

This creates a bridge between external console processes and Copilot, allowing you to debug and analyze output from various running programs.

## Features

### Console Logger Features

- Wraps any command and captures output in real-time
- Displays output to console (normal behavior) while simultaneously logging to files
- Creates structured JSON log entries with timestamps, log levels, and metadata
- Automatically detects log levels based on content (error, warn, info, debug)
- Handles process termination gracefully

### MCP Server Tools

- `search_logs` - Search through all console logs for specific text/patterns
- `get_recent_errors` - Get recent error messages from all processes
- `list_processes` - List all processes that have console logs
- `tail_process_logs` - Get latest entries from a specific process
- `get_log_summary` - Get summary of log activity across all processes

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Starting the Console Logger

Use the console logger to wrap any command:

```bash
# Start a development server
console-logger "dev-server" npm run dev

# Run a Python script
console-logger "python-app" python app.py

# Start a Docker container with logs
console-logger "docker-app" docker logs -f my-container

# Run any command with arguments
console-logger "webpack-build" npx webpack --watch --mode development
```

The logger will:

1. Display the command output in your console (normal behavior)
2. Save structured logs to `./console_logs/[process-name].json`
3. Include metadata like timestamps, log levels, PID, and source (stdout/stderr)

### Log File Structure

Each log entry is a JSON object:

```json
{
  "timestamp": "2025-06-16T20:30:45.123Z",
  "level": "error",
  "message": "Connection failed to database",
  "process": "my-server",
  "command": "npm start",
  "pid": 12345,
  "source": "stderr"
}
```

### Using the MCP Server

The MCP server provides tools that Copilot can use to search and analyze your logs:

1. **Search logs**: Find specific text across all log files
2. **Get recent errors**: Quickly identify recent error messages
3. **List processes**: See all processes that have logs
4. **Tail logs**: Get the latest entries from a specific process
5. **Get summary**: Overview of log activity across all processes

## Configuration

### Environment Variables

- `CONSOLE_LOG_DIR` - Directory to store log files (default: `./console_logs`)

### MCP Configuration

Add to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "console-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/console_mcp/build/index.js"]
    }
  }
}
```

## Examples

### Example 1: Monitor a Development Server

```bash
# Start your dev server with logging
console-logger "next-dev" npm run dev

# Now you can ask Copilot:
# "Are there any errors in my Next.js development server?"
# "Show me the latest logs from next-dev"
# "What warnings have occurred in the last hour?"
```

### Example 2: Debug Multiple Services

```bash
# Terminal 1: API server
console-logger "api-server" npm run start:api

# Terminal 2: Frontend
console-logger "frontend" npm run dev

# Terminal 3: Database
console-logger "postgres" docker logs -f postgres-container

# Now ask Copilot:
# "Which service has the most errors?"
# "Show me a summary of all service activity"
# "Are there any database connection errors?"
```

### Example 3: Build Process Monitoring

```bash
# Monitor a build process
console-logger "webpack-build" npx webpack --watch

# Ask Copilot:
# "Did the webpack build succeed?"
# "What compilation errors occurred?"
# "Show me the build timeline"
```

## Development

### Building

```bash
npm run build
```

### Running the MCP Server

```bash
npm start
```

### Running the Console Logger

```bash
npm run logger -- "process-name" command args
```

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Your Command  │───▶│  Console Logger  │───▶│   JSON Logs     │
│   (any process) │    │  (captures I/O)  │    │ (structured)    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│     Copilot     │◀───│   MCP Server     │◀───│   Log Reader    │
│  (AI Assistant) │    │ (search tools)   │    │ (file parser)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Benefits

1. **Non-intrusive**: Your existing commands work exactly the same
2. **Real-time**: See output immediately while logging in background
3. **Structured**: Searchable JSON format with metadata
4. **AI-powered**: Ask Copilot natural language questions about your logs
5. **Multi-process**: Monitor multiple services simultaneously
6. **Persistent**: Logs are saved and can be analyzed later

## Troubleshooting

### Permissions

If you get permission errors, make sure the scripts are executable:

```bash
chmod +x build/index.js build/logger.js
```

### Log Directory

If logs aren't being created, check that the log directory is writable:

```bash
mkdir -p ./console_logs
ls -la ./console_logs
```

### MCP Connection

If the MCP server isn't connecting to Claude Desktop:

1. Check the absolute path in your MCP configuration
2. Ensure the project is built (`npm run build`)
3. Restart Claude Desktop after configuration changes

## License

ISC
