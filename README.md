# Console MCP Server

An MCP (Model Context Protocol) server that provides a bridge between external console processes and Copilot through **SQLite-based log storage and search capabilities**.

## 🚀 Key Features

### High-Performance SQLite Storage
- **10-100x faster searches** with indexed queries and FTS5 full-text search
- **Reduced memory usage** with streaming results instead of loading entire files
- **Better concurrency** with SQLite WAL mode for simultaneous read/write operations
- **Scalable architecture** handles large log volumes efficiently

### Console Logger
- Wraps any command and captures stdout/stderr to structured SQLite database
- Real-time log storage with proper indexing
- Automatic log level detection (info, warn, error, debug)
- Process lifecycle tracking with start/end times and exit codes

### MCP Server Tools
- `search_logs` - Full-text search through all console logs using FTS5
- `get_recent_errors` - Get recent error messages from all processes
- `list_processes` - List all processes with their status and activity
- `tail_process_logs` - Get latest entries from a specific process
- `get_log_summary` - Get aggregated statistics across all processes

## 🛠 Installation

There are several ways to install and use the Console MCP tools:

### Option 1: Global npm Installation (Recommended)

Install globally to use `console-logger` and `console-mcp` from any directory:

```bash
# Clone the repository
git clone <repository-url>
cd console_mcp

# Install dependencies and build
npm install
npm run build

# Install globally
npm install -g .

# Verify installation
console-logger --help
console-mcp --help
```

After global installation, you can use the tools from any terminal session:

```bash
# Use from any directory
cd ~/my-project
console-logger "my-app" npm start
```

### Option 2: Local Installation with PATH

Add the built binaries to your PATH for the current session or permanently:

```bash
# Clone and build
git clone <repository-url>
cd console_mcp
npm install && npm run build

# Add to PATH for current session
export PATH="$PATH:$(pwd)/build"

# Or add permanently to your shell profile (~/.zshrc, ~/.bashrc, etc.)
echo 'export PATH="$PATH:/path/to/console_mcp/build"' >> ~/.zshrc
source ~/.zshrc
```

### Option 3: Shell Aliases

Create convenient shell aliases for the tools:

```bash
# Add to ~/.zshrc or ~/.bashrc
alias console-logger='/path/to/console_mcp/build/logger.js'
alias console-mcp='/path/to/console_mcp/build/index.js'

# Reload shell configuration
source ~/.zshrc
```

### Option 4: Local Development

For development or testing without global installation:

```bash
# Clone and build
git clone <repository-url>
cd console_mcp
npm install
npm run build

# Use with full paths
./build/logger.js "my-process" npm start
./build/index.js  # Start MCP server
```

### Quick Setup Script

For the fastest setup, you can use this one-liner:

```bash
# Clone, build, and install globally in one command
git clone <repository-url> console_mcp && cd console_mcp && npm install && npm run build && npm install -g . && echo "✅ Console MCP installed globally!"
```

Or create a setup script:

```bash
#!/bin/bash
# setup-console-mcp.sh
set -e

echo "🚀 Setting up Console MCP..."

# Clone repository
if [ ! -d "console_mcp" ]; then
  git clone <repository-url> console_mcp
fi

cd console_mcp

# Install dependencies and build
echo "📦 Installing dependencies..."
npm install

echo "🔨 Building project..."
npm run build

# Install globally
echo "🌍 Installing globally..."
npm install -g .

echo "✅ Console MCP setup complete!"
echo ""
echo "You can now use:"
echo "  console-logger \"my-app\" npm start"
echo "  console-mcp"
echo ""
echo "Logs will be stored in ~/.console-logs/"
```

Make it executable and run:
```bash
chmod +x setup-console-mcp.sh
./setup-console-mcp.sh
```

### Verification

Test that the installation works:

```bash
# Test console logger
console-logger "test" echo "Hello World"

# Check that logs are created
ls ~/.console-logs/

# Test MCP server (in another terminal)
console-mcp
```

### Dependencies
- `better-sqlite3` - High-performance SQLite3 bindings
- `@modelcontextprotocol/sdk` - MCP protocol implementation

## 📖 Usage

### 1. Start Console Logger
Wrap any command to capture its output to the SQLite database:

```bash
# Start a web server with logging
console-logger "my-server" npm start

# Monitor a build process
console-logger "webpack-build" npx webpack --watch

# Log a Python application
console-logger "python-app" python app.py

# Follow Docker container logs
console-logger "docker-container" docker logs -f container-name

# Any command with arguments
console-logger "my-process" command arg1 arg2
```

### Help and Options

Get help for either tool:

```bash
# Console logger help
console-logger --help
console-logger

# MCP server help  
console-mcp --help
```

### Environment Variables

- `CONSOLE_LOG_DIR` - Directory for SQLite database (default: `~/.console-logs`)

Example:
```bash
# Use custom log directory
export CONSOLE_LOG_DIR="/path/to/my/logs"
console-logger "my-app" npm start
```

### 2. Use MCP Server
The MCP server provides tools to search and analyze the captured logs:

```bash
# Start the MCP server
console-mcp
```

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

## 📝 Session Summaries

The Console MCP server now includes powerful session summary capabilities that allow Copilot sessions to store and search context across different VS Code instances and sessions.

### Creating Session Summaries

Session summaries capture important information about your development sessions:

```typescript
// Example: Creating a session summary
{
  title: "Implemented User Authentication",
  description: `# Authentication Feature Implementation
  
  ## What was accomplished:
  - Added JWT token validation
  - Implemented login/logout endpoints
  - Created user session middleware
  
  ## Key changes:
  - Modified auth.ts to include bcrypt hashing
  - Updated API routes for security
  - Added environment variables for JWT secrets`,
  
  tags: ["authentication", "security", "api-endpoints"],
  project: "my-webapp",  // Auto-detected from git/package.json
  llm_model: "claude-3.5-sonnet",
  files_changed: ["src/auth.ts", "api/login.ts", ".env.example"]  // Auto-detected from git
}
```

### Auto-Detection Features

The session summary system automatically detects:

- **Project name** from `package.json` or git repository name
- **Changed files** from git status (unstaged, staged, and recent commits)
- **Git repository context** for better organization

### Searching Session Summaries

Use the MCP tools to find relevant context from previous sessions:

- `search_session_summaries` - Full-text search across titles, descriptions, and tags
- `get_session_summaries_by_project` - Find all summaries for a specific project
- `get_session_summaries_by_tags` - Filter by specific tags like "bug-fix" or "feature"
- `get_recent_session_summaries` - Get recent development activity

### Use Cases

1. **Cross-Session Context**: When starting work on a project, search for related summaries to understand recent changes
2. **Team Collaboration**: Share development insights and lessons learned
3. **Project Documentation**: Maintain a searchable history of development decisions
4. **Debugging**: Find similar issues and solutions from previous sessions

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

## 🔧 Troubleshooting

### Global Installation Issues

If `console-logger` or `console-mcp` commands are not found after global installation:

1. **Check npm global bin directory:**
   ```bash
   npm config get prefix
   npm bin -g
   ```

2. **Ensure global bin directory is in PATH:**
   ```bash
   echo $PATH
   # Should include your npm global bin directory
   ```

3. **Add npm global bin to PATH if missing:**
   ```bash
   # Add to ~/.zshrc or ~/.bashrc
   export PATH="$PATH:$(npm bin -g)"
   source ~/.zshrc
   ```

4. **Alternative: Use npx (no global install needed):**
   ```bash
   npx /path/to/console_mcp/build/logger.js "my-app" npm start
   ```

### Permission Issues

If you get permission errors during global installation:

```bash
# Option 1: Use sudo (not recommended)
sudo npm install -g .

# Option 2: Configure npm to use different directory (recommended)
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH="$PATH:~/.npm-global/bin"
```

### Database Location

By default, logs are stored in `~/.console-logs/`. To check or change:

```bash
# Check current location
echo $CONSOLE_LOG_DIR

# Set custom location
export CONSOLE_LOG_DIR="/path/to/logs"
mkdir -p "$CONSOLE_LOG_DIR"
```

### Shell Integration Tips

For an even better experience, consider these shell enhancements:

1. **Create shell functions for common patterns:**
   ```bash
   # Add to ~/.zshrc or ~/.bashrc
   
   # Function to easily start dev servers with logging
   dev-with-logs() {
     local name="${1:-dev-server}"
     shift
     console-logger "$name" "$@"
   }
   
   # Function to tail logs for a process
   logs() {
     local process="$1"
     console-mcp tail_process_logs --process="$process"
   }
   
   # Function to search recent logs
   search-logs() {
     console-mcp search_logs --query="$1" --limit=20
   }
   ```

2. **Quick aliases for common commands:**
   ```bash
   alias clog='console-logger'
   alias cmcp='console-mcp'
   alias show-logs='ls -la ~/.console-logs/'
   ```

3. **Usage examples with shell functions:**
   ```bash
   # Start development server with logging
   dev-with-logs "my-app" npm run dev
   
   # Search for errors
   search-logs "error"
   
   # View logs for specific process
   logs "my-app"
   ```

## License

ISC
