# Console MCP Design Document

## Overview

The Console MCP (Model Context Protocol) is a bridge system that connects external console processes with Copilot through structured log capture and search capabilities. This project consists of two main components:

1. **Console Logger** - A command wrapper that captures stdout/stderr from any process and stores it in a searchable database
2. **MCP Server** - Provides tools for searching, analyzing, and monitoring the captured logs through the Model Context Protocol

## Architecture

### High-Level System Architecture

```mermaid
graph TB
    subgraph "External Processes"
        P1[Process 1<br/>npm start]
        P2[Process 2<br/>python script.py]
        P3[Process N<br/>any command]
    end

    subgraph "Console Logger Layer"
        CL1[Console Logger 1]
        CL2[Console Logger 2]
        CL3[Console Logger N]
    end

    subgraph "Storage Layer"
        DB[(SQLite Database<br/>console_logs.db)]
        FTS[Full-Text Search<br/>FTS5 Index]
    end

    subgraph "MCP Server Layer"
        MCP[MCP Server<br/>index.ts]
        Tools[Search Tools]
    end

    subgraph "Client Layer"
        Copilot[GitHub Copilot]
        VSCode[VS Code]
    end

    P1 --> CL1
    P2 --> CL2
    P3 --> CL3

    CL1 --> DB
    CL2 --> DB
    CL3 --> DB

    DB --> FTS

    MCP --> DB
    MCP --> FTS
    Tools --> MCP

    Copilot --> MCP
    VSCode --> MCP

    style DB fill:#e1f5fe
    style FTS fill:#e8f5e8
    style MCP fill:#fff3e0
    style Tools fill:#f3e5f5
```

### Component Interaction Flow

```mermaid
sequenceDiagram
    participant User
    participant ConsoleLogger
    participant Process
    participant Database
    participant MCPServer
    participant Copilot

    User->>ConsoleLogger: console-logger "app" npm start
    ConsoleLogger->>Database: Create process record
    ConsoleLogger->>Process: spawn(npm, [start])

    loop Process Runtime
        Process->>ConsoleLogger: stdout/stderr output
        ConsoleLogger->>ConsoleLogger: Parse & classify logs
        ConsoleLogger->>Database: Store log entries
    end

    Process->>ConsoleLogger: Process exit
    ConsoleLogger->>Database: Update process status

    User->>Copilot: "Find recent errors in my app"
    Copilot->>MCPServer: get_recent_errors tool
    MCPServer->>Database: Query logs with FTS
    Database->>MCPServer: Return filtered results
    MCPServer->>Copilot: Formatted log entries
    Copilot->>User: Error analysis & suggestions
```

## Core Components

### 1. Console Logger (`src/logger.ts`)

The Console Logger is a command wrapper that intercepts and captures all output from child processes.

#### Key Features

- **Process Wrapping**: Spawns child processes and captures all stdout/stderr
- **Intelligent Log Classification**: Automatically detects log levels (error, warn, info, debug)
- **Real-time Storage**: Streams log entries to SQLite database as they occur
- **Process Lifecycle Management**: Tracks process start, end, exit codes, and status

#### Log Level Detection Algorithm

```mermaid
flowchart TD
    A[Raw Log Message] --> B{Source = stderr?}
    B -->|Yes| C[Level = ERROR]
    B -->|No| D{Contains error keywords?}
    D -->|Yes| C
    D -->|No| E{Contains warning keywords?}
    E -->|Yes| F[Level = WARN]
    E -->|No| G{Contains debug keywords?}
    G -->|Yes| H[Level = DEBUG]
    G -->|No| I[Level = INFO]

    C --> J[Store to Database]
    F --> J
    H --> J
    I --> J
```

#### Usage

```bash
console-logger "my-app" npm start
console-logger "python-script" python analyze.py --verbose
console-logger "build-process" make build
```

### 2. Database Layer (`src/database.ts`)

The database layer provides structured storage and efficient querying capabilities.

#### Schema Design

```mermaid
erDiagram
    PROCESSES {
        int id PK
        string name
        string command
        string start_time
        string end_time
        string status
        int exit_code
        int pid
    }

    LOG_ENTRIES {
        int id PK
        int process_id FK
        string timestamp
        string level
        string message
        string raw_output
        string source
    }

    LOG_ENTRIES_FTS {
        string message
        string raw_output
        int rowid
    }

    PROCESSES ||--o{ LOG_ENTRIES : "has many"
    LOG_ENTRIES ||--|| LOG_ENTRIES_FTS : "indexed by"
```

#### Database Features

- **SQLite with FTS5**: Full-text search capabilities for efficient log searching
- **Optimized Indexing**: Indexes on timestamp, level, and process_id for fast queries
- **PRAGMA Optimizations**: WAL mode, synchronous=NORMAL for performance
- **Automatic Cleanup**: Built-in methods for old log cleanup and maintenance

### 3. MCP Server (`src/index.ts`)

The MCP Server exposes structured tools for log analysis through the Model Context Protocol.

#### Available Tools

```mermaid
mindmap
  root((MCP Tools))
    search_logs
      Full-text search
      Filter by process
      Filter by level
      Time-based filtering
      FTS5 syntax support
    get_recent_errors
      Time-based error filtering
      Process-specific errors
      Configurable lookback
    list_processes
      All logged processes
      Active processes only
      Process metadata
    tail_process_logs
      Real-time log following
      Level filtering
      Configurable line count
    get_log_summary
      Activity summaries
      Error rate analysis
      Process statistics
```

#### Tool Implementation Pattern

```mermaid
flowchart LR
    A[Tool Request] --> B[Input Validation]
    B --> C[Database Query]
    C --> D[Result Processing]
    D --> E[Response Formatting]
    E --> F[Return to Client]

    B --> G{Validation Failed?}
    G -->|Yes| H[Error Response]
    G -->|No| C
```

## Data Flow

### Log Capture Flow

```mermaid
flowchart TD
    A[External Command] --> B[Console Logger Spawn]
    B --> C[Process Execution]

    C --> D[stdout Output]
    C --> E[stderr Output]

    D --> F[Log Level Detection]
    E --> F

    F --> G[Message Parsing]
    G --> H[Database Insert]

    H --> I[(SQLite Storage)]
    I --> J[FTS5 Indexing]

    C --> K{Process Exit?}
    K -->|No| C
    K -->|Yes| L[Update Process Status]
    L --> I
```

### Search Query Flow

```mermaid
flowchart TD
    A[MCP Client Request] --> B[Tool Handler]
    B --> C[Parameter Validation]
    C --> D[Build SQL Query]

    D --> E{Use FTS5?}
    E -->|Yes| F[Full-Text Search Query]
    E -->|No| G[Standard SQL Query]

    F --> H[Execute Query]
    G --> H

    H --> I[Result Processing]
    I --> J[Apply Filters]
    J --> K[Format Response]
    K --> L[Return to Client]

    C --> M{Invalid Params?}
    M -->|Yes| N[Error Response]
    M -->|No| D
```

## Key Design Decisions

### 1. SQLite with FTS5

- **Rationale**: Provides excellent full-text search capabilities without external dependencies
- **Benefits**: Fast text searches, simple deployment, ACID compliance
- **Trade-offs**: Single-writer limitation (acceptable for this use case)

### 2. Real-time Log Streaming

- **Rationale**: Immediate availability of logs for debugging active processes
- **Implementation**: Synchronous database writes on each log line
- **Performance**: Optimized with WAL mode and prepared statements

### 3. Automatic Log Level Detection

- **Rationale**: Reduces manual configuration while providing useful categorization
- **Algorithm**: Keyword-based detection with stderr source prioritization
- **Fallback**: Default to 'info' level when uncertain

### 4. Process-centric Organization

- **Rationale**: Natural grouping for troubleshooting and analysis
- **Benefits**: Easy process-specific filtering and lifecycle tracking
- **Implementation**: Foreign key relationship with cascade cleanup

## Performance Considerations

### Database Optimization

```sql
-- Indexing strategy for common queries
CREATE INDEX idx_log_entries_timestamp ON log_entries(timestamp);
CREATE INDEX idx_log_entries_level ON log_entries(level);
CREATE INDEX idx_log_entries_process_id ON log_entries(process_id);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE log_entries_fts USING fts5(
  message, raw_output, content='log_entries', content_rowid='id'
);
```

### Memory Management

- **Streaming Processing**: Process logs line-by-line to avoid memory accumulation
- **Batch Inserts**: Group database operations for better performance
- **Connection Pooling**: Reuse database connections across operations

## Security Considerations

### Data Protection

- **Local Storage**: All logs stored locally, no external transmission
- **File Permissions**: Database files created with restricted permissions
- **Input Sanitization**: All user inputs validated and sanitized

### Process Isolation

- **Child Process Security**: Spawned processes inherit minimal environment
- **Command Validation**: Basic validation of command arguments
- **Error Handling**: Graceful handling of process failures

## Usage Patterns

### Development Workflow

```mermaid
graph LR
    A[Start Development] --> B[Launch Processes with Logger]
    B --> C[Code & Test]
    C --> D{Issues Found?}
    D -->|Yes| E[Query Logs via Copilot]
    E --> F[Analyze Errors]
    F --> G[Fix Issues]
    G --> C
    D -->|No| H[Continue Development]

    E --> I[search_logs tool]
    E --> J[get_recent_errors tool]
    E --> K[tail_process_logs tool]
```

### Debugging Scenarios

1. **Error Investigation**:

   ```text
   Copilot: "Find all errors in the last hour"
   → get_recent_errors(hours=1)
   ```

2. **Process Monitoring**:

   ```text
   Copilot: "Show me what my build process is doing"
   → tail_process_logs(process="build", lines=50)
   ```

3. **Pattern Analysis**:

   ```text
   Copilot: "Search for database connection issues"
   → search_logs(query="database connection", level="error")
   ```

## Future Enhancements

### Potential Improvements

- **Log Rotation**: Automatic cleanup of old logs based on age/size
- **Performance Metrics**: CPU/memory usage tracking for processes
- **Real-time Notifications**: Alert system for critical errors
- **Log Aggregation**: Merge logs from multiple sources
- **Export Capabilities**: Export logs in various formats (JSON, CSV)

### Scalability Considerations

- **Horizontal Scaling**: Multiple MCP servers for different log directories
- **Compression**: Compress old log entries to save space
- **Partitioning**: Partition large tables by time ranges
- **Caching**: Cache frequently accessed queries

## Integration Examples

### VS Code Integration

```json
{
  "mcpServers": {
    "console-mcp": {
      "command": "node",
      "args": ["/path/to/console_mcp/build/index.js"],
      "env": {
        "CONSOLE_LOG_DIR": "/path/to/logs"
      }
    }
  }
}
```

### Development Script Integration

```bash
#!/bin/bash
# start-dev.sh
console-logger "frontend" npm run dev &
console-logger "backend" python manage.py runserver &
console-logger "worker" celery worker &

echo "All processes started with logging enabled"
```

This design enables powerful debugging workflows where developers can use natural language queries through Copilot to investigate issues across multiple concurrent processes, making the development and debugging process more efficient and intuitive.
