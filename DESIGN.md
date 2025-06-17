# Console MCP Design Document

## Overview

The Console MCP (Model Context Protocol) is a bridge system that connects external console processes with Copilot through structured log capture, search capabilities, and session context management. This project consists of three main components:

1. **Console Logger** - A command wrapper that captures stdout/stderr from any process and stores it in a searchable database
2. **MCP Server** - Provides tools for searching, analyzing, and monitoring the captured logs through the Model Context Protocol
3. **Session Summary System** - Captures and enables searching of development session context across different Copilot instances

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
        SS[(Session Summaries<br/>Cross-session context)]
    end

    subgraph "MCP Server Layer"
        MCP[MCP Server<br/>index.ts]
        Tools[Search Tools]
        SessionTools[Session Tools]
    end

    subgraph "Client Layer"
        Copilot[GitHub Copilot]
        VSCode[VS Code]
        Git[Git Integration<br/>Auto-detection]
    end

    P1 --> CL1
    P2 --> CL2
    P3 --> CL3

    CL1 --> DB
    CL2 --> DB
    CL3 --> DB

    DB --> FTS
    DB --> SS

    MCP --> DB
    MCP --> FTS
    MCP --> SS
    Tools --> MCP
    SessionTools --> MCP

    Copilot --> MCP
    VSCode --> MCP
    Git --> MCP

    style DB fill:#e1f5fe
    style FTS fill:#e8f5e8
    style SS fill:#fff9c4
    style MCP fill:#fff3e0
    style Tools fill:#f3e5f5
    style SessionTools fill:#e8f5e8
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

    SESSION_SUMMARIES {
        int id PK
        string title
        string description
        string tags
        string timestamp
        string project
        string llm_model
        string files_changed
    }

    LOG_ENTRIES_FTS {
        string message
        string raw_output
        int rowid
    }

    SESSION_SEARCH_FTS {
        string title
        string description
        string tags
        string project
        int rowid
    }

    PROCESSES ||--o{ LOG_ENTRIES : "has many"
    LOG_ENTRIES ||--|| LOG_ENTRIES_FTS : "indexed by"
    SESSION_SUMMARIES ||--|| SESSION_SEARCH_FTS : "indexed by"
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
    Log Analysis
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
    Session Management
      create_session_summary
        Store development sessions
        Auto-detect project info
        Auto-detect changed files
        Git integration
      search_session_summaries
        Full-text search across sessions
        Filter by project
        Filter by time range
        Cross-session context
      get_session_summaries_by_project
        Project-specific sessions
        Development history
      get_session_summaries_by_tags
        Tag-based filtering
        Topic organization
      get_recent_session_summaries
        Recent development activity
        Timeline view
      list_projects
        All projects with sessions
        Project discovery
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

### 4. Session Summary System (`src/git-utils.ts`)

The Session Summary System enables persistent context sharing across different Copilot sessions and VS Code instances.

#### Session Summary Features

- **Cross-Session Context**: Store and retrieve development session summaries
- **Automatic Git Integration**: Auto-detect project names and changed files
- **Full-Text Search**: Search across session titles, descriptions, and tags
- **Project Organization**: Group sessions by project for easy navigation
- **Tag-Based Categorization**: Organize sessions with searchable tags

#### Session Summary Flow

```mermaid
flowchart TD
    A[Development Session] --> B[Session Complete]
    B --> C[Create Session Summary]
    C --> D[Auto-detect Project Info]
    D --> E[Git Integration]

    E --> F[Get Project Name]
    E --> G[Get Changed Files]

    F --> H[From package.json]
    F --> I[From git repo name]
    F --> J[From directory name]

    G --> K[Unstaged changes]
    G --> L[Staged changes]
    G --> M[Recent commits]

    D --> N[Store Summary]
    N --> O[(Session Database)]
    O --> P[FTS5 Indexing]

    Q[Future Copilot Session] --> R[Search for Context]
    R --> S[Query Session Database]
    S --> T[Retrieve Relevant Sessions]
    T --> U[Provide Context]
```

#### Git Integration Strategy

```mermaid
flowchart TD
    A[getGitChangedFiles] --> B{Try HEAD~5..HEAD}
    B -->|Success| C[Get Recent Commits]
    B -->|Fail| D{Try HEAD~1..HEAD}
    D -->|Success| E[Get Last Commit]
    D -->|Fail| F{Try ls-files --modified}
    F -->|Success| G[Get Modified Files]
    F -->|Fail| H[Empty Array]

    I[getProjectName] --> J{Check package.json}
    J -->|Found| K[Use package.name]
    J -->|Not Found| L{Check git remote}
    L -->|Found| M[Extract repo name]
    L -->|Not Found| N[Use directory name]

    C --> O[Combine & Deduplicate]
    E --> O
    G --> O
    H --> O

    K --> P[Return Project Info]
    M --> P
    N --> P
```

#### Session Summary Schema

```json
{
  "id": 1,
  "title": "Implemented Authentication System",
  "description": "# Authentication Implementation\n\n## Overview\n...",
  "tags": "[\"authentication\", \"security\", \"api\"]",
  "timestamp": "2025-06-17T23:09:20.411Z",
  "project": "my-webapp",
  "llm_model": "claude-3.5-sonnet",
  "files_changed": "[\"src/auth.ts\", \"api/login.ts\", \".env.example\"]"
}
```

#### Use Cases

1. **Cross-Session Context Retrieval**:
   ```text
   Copilot: "Search for previous authentication work"
   → search_session_summaries(query="authentication")
   ```

2. **Project Development History**:
   ```text
   Copilot: "Show me all work done on this project"
   → get_session_summaries_by_project(project="my-webapp")
   ```

3. **Feature-Specific Context**:
   ```text
   Copilot: "Find sessions about bug fixes"
   → get_session_summaries_by_tags(tags=["bug-fix"])
   ```

4. **Recent Development Activity**:
   ```text
   Copilot: "What was worked on recently?"
   → get_recent_session_summaries(hours=72)
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

4. **Context-Aware Debugging**:

   ```text
   Copilot: "What authentication work was done previously?"
   → search_session_summaries(query="authentication")
   ```

5. **Project History Analysis**:

   ```text
   Copilot: "Show me all bug fixes for this project"
   → get_session_summaries_by_tags(tags=["bug-fix"])
   ```

6. **Cross-Session Problem Solving**:

   ```text
   Copilot: "Find similar database issues from past sessions"
   → search_session_summaries(query="database error solution")
   ```

### Potential Improvements

**Log Management**:
- **Log Rotation**: Automatic cleanup of old logs based on age/size
- **Performance Metrics**: CPU/memory usage tracking for processes
- **Real-time Notifications**: Alert system for critical errors
- **Log Aggregation**: Merge logs from multiple sources
- **Export Capabilities**: Export logs in various formats (JSON, CSV)

**Session Enhancement**:
- **Automatic Session Detection**: Smart detection of session boundaries
- **Visual Session Timeline**: Timeline view of development sessions
- **Session Sharing**: Export/import session summaries for team collaboration
- **AI-Powered Insights**: Automatic extraction of key insights from sessions
- **Integration with Git History**: Link sessions to specific commits/branches
- **Session Templates**: Pre-defined templates for common session types
