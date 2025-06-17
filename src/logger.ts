#!/usr/bin/env node

import { spawn } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";
import { createWriteStream } from "fs";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  process: string;
  command?: string;
  pid?: number;
  source: "stdout" | "stderr";
}

class ConsoleLogger {
  private logDirectory: string;
  private processName: string;
  private command: string[];
  private logStream?: NodeJS.WritableStream;

  constructor(processName: string, command: string[], logDirectory?: string) {
    this.processName = processName;
    this.command = command;
    this.logDirectory =
      logDirectory ||
      process.env.CONSOLE_LOG_DIR ||
      "/Users/barryvelasquez/logs";
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.access(this.logDirectory);
    } catch {
      await fs.mkdir(this.logDirectory, { recursive: true });
    }
  }

  private async initLogStream(): Promise<void> {
    await this.ensureLogDirectory();
    const logFile = path.join(this.logDirectory, `${this.processName}.json`);
    this.logStream = createWriteStream(logFile, { flags: "a" });
  }

  private writeLogEntry(
    message: string,
    source: "stdout" | "stderr",
    level?: string,
  ): void {
    if (!this.logStream) return;

    // Determine log level based on content if not specified
    let detectedLevel = level || "info";
    const lowerMessage = message.toLowerCase();

    if (
      source === "stderr" ||
      lowerMessage.includes("error") ||
      lowerMessage.includes("fail")
    ) {
      detectedLevel = "error";
    } else if (lowerMessage.includes("warn")) {
      detectedLevel = "warn";
    } else if (lowerMessage.includes("debug")) {
      detectedLevel = "debug";
    }

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: detectedLevel,
      message: message.trim(),
      process: this.processName,
      command: this.command.join(" "),
      pid: process.pid,
      source,
    };

    this.logStream.write(JSON.stringify(logEntry) + "\n");
  }

  async start(): Promise<void> {
    await this.initLogStream();

    console.log(
      `🚀 Starting process "${this.processName}": ${this.command.join(" ")}`,
    );
    console.log(
      `📝 Logging to: ${path.join(
        this.logDirectory,
        this.processName + ".json",
      )}`,
    );
    console.log("=====================================\n");

    const [command, ...args] = this.command;
    const childProcess = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"],
      env: { ...process.env },
    });

    // Log process start
    this.writeLogEntry(
      `Process started: ${this.command.join(" ")} (PID: ${childProcess.pid})`,
      "stdout",
      "info",
    );

    // Handle stdout
    childProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();

      // Write to console (so user can see output)
      process.stdout.write(output);

      // Split into lines and log each one
      const lines = output.split("\n").filter((line) => line.trim());
      lines.forEach((line) => {
        this.writeLogEntry(line, "stdout");
      });
    });

    // Handle stderr
    childProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();

      // Write to console (so user can see output)
      process.stderr.write(output);

      // Split into lines and log each one
      const lines = output.split("\n").filter((line) => line.trim());
      lines.forEach((line) => {
        this.writeLogEntry(line, "stderr");
      });
    });

    // Handle process exit
    childProcess.on("exit", (code, signal) => {
      const exitMessage = `Process exited with code ${code}${
        signal ? ` (signal: ${signal})` : ""
      }`;
      console.log(`\n🏁 ${exitMessage}`);
      this.writeLogEntry(exitMessage, "stdout", code === 0 ? "info" : "error");

      if (this.logStream) {
        (this.logStream as any).end();
      }

      process.exit(code || 0);
    });

    // Handle process errors
    childProcess.on("error", (error) => {
      const errorMessage = `Process error: ${error.message}`;
      console.error(`❌ ${errorMessage}`);
      this.writeLogEntry(errorMessage, "stderr", "error");

      if (this.logStream) {
        (this.logStream as any).end();
      }

      process.exit(1);
    });

    // Handle SIGINT (Ctrl+C) to gracefully shutdown
    process.on("SIGINT", () => {
      console.log("\n🛑 Received SIGINT, terminating process...");
      this.writeLogEntry(
        "Process terminated by user (SIGINT)",
        "stdout",
        "info",
      );
      childProcess.kill("SIGINT");
    });

    // Handle SIGTERM
    process.on("SIGTERM", () => {
      console.log("\n🛑 Received SIGTERM, terminating process...");
      this.writeLogEntry("Process terminated (SIGTERM)", "stdout", "info");
      childProcess.kill("SIGTERM");
    });
  }
}

function printUsage() {
  console.log(`
Console Logger - Capture and log console output to JSON files

Usage:
  console-logger <process-name> <command> [args...]

Examples:
  console-logger "my-server" npm start
  console-logger "webpack-build" npx webpack --watch
  console-logger "python-app" python app.py
  console-logger "docker-container" docker logs -f container-name

Environment Variables:
  CONSOLE_LOG_DIR - Directory to store log files (default: /Users/barryvelasquez/logs)

The logger will:
1. Start your command and display output in the console
2. Simultaneously log all output to JSON files in the log directory
3. Each log entry includes timestamp, level, source (stdout/stderr), and metadata
4. The MCP server can then search and analyze these logs
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
