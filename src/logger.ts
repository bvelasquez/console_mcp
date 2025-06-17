#!/usr/bin/env node

import { spawn, ChildProcess } from "child_process";
import { LogDatabase, LogEntry } from "./database.js";
import * as path from "path";
import * as os from "os";

class ConsoleLogger {
  private db: LogDatabase;
  private processName: string;
  private command: string[];
  private processId?: number;
  private childProcess?: ChildProcess;

  constructor(processName: string, command: string[], logDirectory?: string) {
    this.processName = processName;
    this.command = command;

    const defaultLogDir =
      logDirectory ||
      process.env.CONSOLE_LOG_DIR ||
      path.join(os.homedir(), ".console-logs");

    this.db = new LogDatabase(defaultLogDir);
  }

  private addLogEntry(
    level: LogEntry["level"],
    message: string,
    rawOutput: string,
    source: LogEntry["source"],
  ) {
    if (!this.processId) return;

    this.db.addLogEntry({
      process_id: this.processId,
      timestamp: new Date().toISOString(),
      level,
      message: message.trim(),
      raw_output: rawOutput,
      source,
    });
  }

  private detectLogLevel(
    message: string,
    source: LogEntry["source"],
  ): LogEntry["level"] {
    const lowerMessage = message.toLowerCase();

    if (
      source === "stderr" ||
      lowerMessage.includes("error") ||
      lowerMessage.includes("fail")
    ) {
      return "error";
    } else if (lowerMessage.includes("warn")) {
      return "warn";
    } else if (lowerMessage.includes("debug")) {
      return "debug";
    }

    return "info";
  }

  async start(): Promise<void> {
    console.log(
      `🚀 Starting process "${this.processName}": ${this.command.join(" ")}`,
    );
    console.log(`📝 Logging to SQLite database in: ${this.db["db"].name}`);
    console.log("=====================================\n");

    const [command, ...args] = this.command;
    this.childProcess = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Create process record in database
    this.processId = this.db.createProcess({
      name: this.processName,
      command: this.command.join(" "),
      start_time: new Date().toISOString(),
      status: "running",
      pid: this.childProcess.pid,
    });

    // Log process start
    this.addLogEntry(
      "info",
      `Process started: ${this.command.join(" ")} (PID: ${
        this.childProcess.pid
      })`,
      `Process started: ${this.command.join(" ")} (PID: ${
        this.childProcess.pid
      })`,
      "stdout",
    );

    // Handle stdout
    this.childProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();

      // Write to console (so user can see output)
      process.stdout.write(output);

      // Split into lines and log each one
      const lines = output.split("\n").filter((line) => line.trim());
      lines.forEach((line) => {
        const level = this.detectLogLevel(line, "stdout");
        this.addLogEntry(level, line, output, "stdout");
      });
    });

    // Handle stderr
    this.childProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();

      // Write to console (so user can see output)
      process.stderr.write(output);

      // Split into lines and log each one
      const lines = output.split("\n").filter((line) => line.trim());
      lines.forEach((line) => {
        const level = this.detectLogLevel(line, "stderr");
        this.addLogEntry(level, line, output, "stderr");
      });
    });

    // Handle process exit
    this.childProcess.on("exit", (code, signal) => {
      const exitMessage = `Process exited with code ${code}${
        signal ? ` (signal: ${signal})` : ""
      }`;
      console.log(`\n🏁 ${exitMessage}`);

      const level = code === 0 ? "info" : "error";
      this.addLogEntry(level, exitMessage, exitMessage, "stdout");

      // Update process status in database
      if (this.processId) {
        const status = code === 0 ? "completed" : "failed";
        this.db.updateProcessStatus(
          this.processId,
          status,
          code || undefined,
          new Date().toISOString(),
        );
      }

      this.db.close();
      process.exit(code || 0);
    });

    // Handle process errors
    this.childProcess.on("error", (error) => {
      const errorMessage = `Process error: ${error.message}`;
      console.error(`❌ ${errorMessage}`);
      this.addLogEntry(
        "error",
        errorMessage,
        error.stack || error.message,
        "stderr",
      );

      // Update process status in database
      if (this.processId) {
        this.db.updateProcessStatus(
          this.processId,
          "failed",
          -1,
          new Date().toISOString(),
        );
      }

      this.db.close();
      process.exit(1);
    });

    // Handle SIGINT (Ctrl+C) to gracefully shutdown
    process.on("SIGINT", () => {
      console.log("\n🛑 Received SIGINT, terminating process...");
      this.addLogEntry(
        "info",
        "Process terminated by user (SIGINT)",
        "Process terminated by user (SIGINT)",
        "stdout",
      );

      if (this.processId) {
        this.db.updateProcessStatus(
          this.processId,
          "failed",
          -1,
          new Date().toISOString(),
        );
      }

      this.childProcess?.kill("SIGINT");
    });

    // Handle SIGTERM
    process.on("SIGTERM", () => {
      console.log("\n🛑 Received SIGTERM, terminating process...");
      this.addLogEntry(
        "info",
        "Process terminated (SIGTERM)",
        "Process terminated (SIGTERM)",
        "stdout",
      );

      if (this.processId) {
        this.db.updateProcessStatus(
          this.processId,
          "failed",
          -1,
          new Date().toISOString(),
        );
      }

      this.childProcess?.kill("SIGTERM");
    });
  }

  stopProcess(): boolean {
    if (!this.childProcess) {
      return false;
    }

    this.childProcess.kill();
    return true;
  }

  getDatabase(): LogDatabase {
    return this.db;
  }

  close() {
    this.childProcess?.kill();
    this.db.close();
  }
}

function printUsage() {
  console.log(`
Console Logger - Capture and log console output to SQLite database

Usage:
  console-logger <process-name> <command> [args...]

Examples:
  console-logger "my-server" npm start
  console-logger "webpack-build" npx webpack --watch
  console-logger "python-app" python app.py
  console-logger "docker-container" docker logs -f container-name

Environment Variables:
  CONSOLE_LOG_DIR - Directory to store log database (default: ~/.console-logs)

The logger will:
1. Start your command and display output in the console
2. Simultaneously log all output to a SQLite database
3. Each log entry includes timestamp, level, source (stdout/stderr), and metadata
4. The MCP server can then search and analyze these logs with fast SQL queries
`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    printUsage();
    process.exit(1);
  }

  const [processName, ...command] = args;

  const logger = new ConsoleLogger(processName, command);
  await logger.start();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
