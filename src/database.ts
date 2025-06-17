import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

export interface LogEntry {
  id?: number;
  process_id: number;
  timestamp: string;
  level: "info" | "error" | "warn" | "debug";
  message: string;
  raw_output: string;
  source: "stdout" | "stderr";
}

export interface Process {
  id?: number;
  name: string;
  command: string;
  start_time: string;
  end_time?: string;
  status: "running" | "completed" | "failed";
  exit_code?: number;
  pid?: number;
}

export interface SessionSummary {
  id?: number;
  title: string;
  description: string;
  tags: string; // JSON array of tags as string
  timestamp: string;
  project: string;
  llm_model?: string;
  files_changed: string; // JSON array of file paths as string
}

export class LogDatabase {
  private db: Database.Database;

  constructor(logDir: string) {
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const dbPath = path.join(logDir, "console_logs.db");
    this.db = new Database(dbPath);

    this.initializeSchema();
    this.optimizeDatabase();
  }

  private initializeSchema() {
    // Create processes table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS processes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        exit_code INTEGER,
        pid INTEGER
      )
    `);

    // Create log_entries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS log_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        process_id INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        raw_output TEXT NOT NULL,
        source TEXT NOT NULL,
        FOREIGN KEY (process_id) REFERENCES processes (id)
      )
    `);

    // Create session_summaries table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS session_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        tags TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        project TEXT NOT NULL,
        llm_model TEXT,
        files_changed TEXT NOT NULL
      )
    `);

    // Create FTS5 table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS log_search USING fts5(
        message,
        raw_output,
        process_name,
        content='log_entries',
        content_rowid='id'
      )
    `);

    // Create FTS5 table for session summary search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS session_search USING fts5(
        title,
        description,
        tags,
        project,
        content='session_summaries',
        content_rowid='id'
      )
    `);

    // Create triggers to maintain FTS index for logs
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS log_entries_ai AFTER INSERT ON log_entries BEGIN
        INSERT INTO log_search(rowid, message, raw_output, process_name)
        SELECT new.id, new.message, new.raw_output, p.name
        FROM processes p WHERE p.id = new.process_id;
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS log_entries_ad AFTER DELETE ON log_entries BEGIN
        DELETE FROM log_search WHERE rowid = old.id;
      END;
    `);

    // Create triggers to maintain FTS index for session summaries
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS session_summaries_ai AFTER INSERT ON session_summaries BEGIN
        INSERT INTO session_search(rowid, title, description, tags, project)
        VALUES (new.id, new.title, new.description, new.tags, new.project);
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS session_summaries_au AFTER UPDATE ON session_summaries BEGIN
        UPDATE session_search SET
          title = new.title,
          description = new.description,
          tags = new.tags,
          project = new.project
        WHERE rowid = new.id;
      END;
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS session_summaries_ad AFTER DELETE ON session_summaries BEGIN
        DELETE FROM session_search WHERE rowid = old.id;
      END;
    `);
  }

  private optimizeDatabase() {
    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_log_entries_process_id ON log_entries(process_id);
      CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_log_entries_level ON log_entries(level);
      CREATE INDEX IF NOT EXISTS idx_processes_name ON processes(name);
      CREATE INDEX IF NOT EXISTS idx_processes_status ON processes(status);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_timestamp ON session_summaries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_session_summaries_project ON session_summaries(project);
    `);

    // Set pragmas for better performance
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = 1000");
  }

  // Process management
  createProcess(process: Omit<Process, "id">): number {
    const stmt = this.db.prepare(`
      INSERT INTO processes (name, command, start_time, status, pid)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      process.name,
      process.command,
      process.start_time,
      process.status,
      process.pid,
    );
    return result.lastInsertRowid as number;
  }

  updateProcessStatus(
    processId: number,
    status: Process["status"],
    exitCode?: number,
    endTime?: string,
  ) {
    const stmt = this.db.prepare(`
      UPDATE processes 
      SET status = ?, exit_code = ?, end_time = ?
      WHERE id = ?
    `);
    stmt.run(status, exitCode, endTime, processId);
  }

  getProcessByName(name: string): Process | undefined {
    const stmt = this.db.prepare(
      "SELECT * FROM processes WHERE name = ? ORDER BY start_time DESC LIMIT 1",
    );
    return stmt.get(name) as Process | undefined;
  }

  getAllProcesses(activeOnly: boolean = false): Process[] {
    const query = activeOnly
      ? 'SELECT * FROM processes WHERE status = "running" ORDER BY start_time DESC'
      : "SELECT * FROM processes ORDER BY start_time DESC";
    const stmt = this.db.prepare(query);
    return stmt.all() as Process[];
  }

  // Log entry management
  addLogEntry(entry: Omit<LogEntry, "id">): number {
    const stmt = this.db.prepare(`
      INSERT INTO log_entries (process_id, timestamp, level, message, raw_output, source)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      entry.process_id,
      entry.timestamp,
      entry.level,
      entry.message,
      entry.raw_output,
      entry.source,
    );
    return result.lastInsertRowid as number;
  }

  // Search and query methods
  searchLogs(
    query: string,
    limit: number = 100,
    processName?: string,
    level?: string,
    since?: string,
  ): Array<LogEntry & { process_name: string }> {
    let sql = `
      SELECT le.*, p.name as process_name
      FROM log_search ls
      JOIN log_entries le ON ls.rowid = le.id
      JOIN processes p ON le.process_id = p.id
      WHERE log_search MATCH ?
    `;

    const params: any[] = [query];

    if (processName) {
      sql += " AND p.name = ?";
      params.push(processName);
    }

    if (level) {
      sql += " AND le.level = ?";
      params.push(level);
    }

    if (since) {
      sql += " AND le.timestamp > ?";
      params.push(since);
    }

    sql += " ORDER BY le.timestamp DESC LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Array<LogEntry & { process_name: string }>;
  }

  getRecentErrors(
    hours: number = 1,
    limit: number = 50,
    processName?: string,
  ): Array<LogEntry & { process_name: string }> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    let sql = `
      SELECT le.*, p.name as process_name
      FROM log_entries le
      JOIN processes p ON le.process_id = p.id
      WHERE le.level = 'error' AND le.timestamp > ?
    `;

    const params: any[] = [since];

    if (processName) {
      sql += " AND p.name = ?";
      params.push(processName);
    }

    sql += " ORDER BY le.timestamp DESC LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Array<LogEntry & { process_name: string }>;
  }

  getProcessLogs(
    processName: string,
    limit: number = 100,
    level?: string,
  ): LogEntry[] {
    let sql = `
      SELECT le.*
      FROM log_entries le
      JOIN processes p ON le.process_id = p.id
      WHERE p.name = ?
    `;

    const params: any[] = [processName];

    if (level) {
      sql += " AND le.level = ?";
      params.push(level);
    }

    sql += " ORDER BY le.timestamp DESC LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as LogEntry[];
  }

  getLogSummary(hours: number = 24): {
    total_processes: number;
    active_processes: number;
    total_entries: number;
    recent_errors: number;
    recent_entries: number;
  } {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const summary = this.db
      .prepare(
        `
      SELECT 
        (SELECT COUNT(*) FROM processes) as total_processes,
        (SELECT COUNT(*) FROM processes WHERE status = 'running') as active_processes,
        (SELECT COUNT(*) FROM log_entries) as total_entries,
        (SELECT COUNT(*) FROM log_entries WHERE level = 'error' AND timestamp > ?) as recent_errors,
        (SELECT COUNT(*) FROM log_entries WHERE timestamp > ?) as recent_entries
    `,
      )
      .get(since, since);

    return summary as any;
  }

  // Session summary management
  createSessionSummary(summary: Omit<SessionSummary, "id">): number {
    const stmt = this.db.prepare(`
      INSERT INTO session_summaries (title, description, tags, timestamp, project, llm_model, files_changed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      summary.title,
      summary.description,
      summary.tags,
      summary.timestamp,
      summary.project,
      summary.llm_model,
      summary.files_changed,
    );
    return result.lastInsertRowid as number;
  }

  searchSessionSummaries(
    query: string,
    limit: number = 50,
    project?: string,
    since?: string,
  ): SessionSummary[] {
    let sql = `
      SELECT ss.*
      FROM session_search s
      JOIN session_summaries ss ON s.rowid = ss.id
      WHERE session_search MATCH ?
    `;

    const params: any[] = [query];

    if (project) {
      sql += " AND ss.project = ?";
      params.push(project);
    }

    if (since) {
      sql += " AND ss.timestamp > ?";
      params.push(since);
    }

    sql += " ORDER BY ss.timestamp DESC LIMIT ?";
    params.push(limit);

    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as SessionSummary[];
  }

  getSessionSummariesByProject(
    project: string,
    limit: number = 50,
  ): SessionSummary[] {
    const stmt = this.db.prepare(`
      SELECT * FROM session_summaries
      WHERE project = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(project, limit) as SessionSummary[];
  }

  getSessionSummariesByTags(
    tags: string[],
    limit: number = 50,
  ): SessionSummary[] {
    // Search for summaries that contain any of the specified tags
    const placeholders = tags
      .map(() => "json_extract(tags, '$') LIKE ?")
      .join(" OR ");
    const sql = `
      SELECT * FROM session_summaries
      WHERE ${placeholders}
      ORDER BY timestamp DESC
      LIMIT ?
    `;

    const params: any[] = tags.map((tag) => `%"${tag}"%`);
    params.push(limit);
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as SessionSummary[];
  }

  getRecentSessionSummaries(
    hours: number = 24,
    limit: number = 50,
  ): SessionSummary[] {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const stmt = this.db.prepare(`
      SELECT * FROM session_summaries
      WHERE timestamp > ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    return stmt.all(since, limit) as SessionSummary[];
  }

  getAllProjects(): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT project FROM session_summaries
      ORDER BY project
    `);
    return stmt.all().map((row: any) => row.project);
  }

  close() {
    this.db.close();
  }
}
