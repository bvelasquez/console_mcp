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

    // Create triggers to maintain FTS index
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
  }

  private optimizeDatabase() {
    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_log_entries_process_id ON log_entries(process_id);
      CREATE INDEX IF NOT EXISTS idx_log_entries_timestamp ON log_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_log_entries_level ON log_entries(level);
      CREATE INDEX IF NOT EXISTS idx_processes_name ON processes(name);
      CREATE INDEX IF NOT EXISTS idx_processes_status ON processes(status);
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

  close() {
    this.db.close();
  }
}
