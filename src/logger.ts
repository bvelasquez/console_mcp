#!/usr/bin/env node

import { spawn, ChildProcess } from "child_process";
import { LogDatabase, LogEntry } from "./database.js";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// Type definition for build info (will be injected during build)
interface BuildInfo {
  timestamp: string;
  version: string;
  buildNumber: number;
}

// This will be replaced during build process
declare const BUILD_INFO: BuildInfo;

// Version checking functionality
function checkForUpdates(): void {
  try {
    // Get the current running file path
    const currentFile = new URL(import.meta.url).pathname;
    const currentDir = path.dirname(currentFile);

    // Try to find the project root and latest build
    const possibleProjectRoots = [
      // If running from global installation, try to find local project
      path.join(os.homedir(), "projects", "console_mcp"),
      path.join(currentDir, ".."), // From build directory to project root
      path.join(process.cwd(), "..", ".."), // If running from node_modules
      process.cwd(), // If running from project directory
      "/Users/barryvelasquez/projects/console_mcp", // Explicit path as fallback
    ];

    for (const projectRoot of possibleProjectRoots) {
      const latestLoggerPath = path.join(projectRoot, "build", "logger.js");

      if (fs.existsSync(latestLoggerPath)) {
        // Skip if this is the same file we're currently running
        if (path.resolve(latestLoggerPath) === path.resolve(currentFile)) {
          continue;
        }

        try {
          // Read the latest build's timestamp
          const latestContent = fs.readFileSync(latestLoggerPath, "utf8");
          const buildInfoMatch = latestContent.match(
            /const BUILD_INFO = ({[\s\S]*?});/,
          );

          if (buildInfoMatch) {
            const latestBuildInfo: BuildInfo = JSON.parse(buildInfoMatch[1]);

            // Compare build numbers (timestamps as numbers)
            if (
              typeof BUILD_INFO !== "undefined" &&
              latestBuildInfo.buildNumber > BUILD_INFO.buildNumber
            ) {
              const currentDate = new Date(
                BUILD_INFO.timestamp,
              ).toLocaleString();
              const latestDate = new Date(
                latestBuildInfo.timestamp,
              ).toLocaleString();

              console.log("⚠️  UPDATE AVAILABLE!");
              console.log(
                "┌─────────────────────────────────────────────────┐",
              );
              console.log(
                "│ 🔄 A newer version of console-logger is available │",
              );
              console.log(
                "├─────────────────────────────────────────────────┤",
              );
              console.log(`│ Current: ${currentDate.padEnd(31)} │`);
              console.log(`│ Latest:  ${latestDate.padEnd(31)} │`);
              console.log(
                "├─────────────────────────────────────────────────┤",
              );
              console.log(
                "│ To update:                                      │",
              );
              console.log(`│   cd ${projectRoot.padEnd(36)} │`);
              console.log(
                "│   npm run update-global                         │",
              );
              console.log(
                "└─────────────────────────────────────────────────┘",
              );
              console.log("");
              return; // Found and displayed update, exit
            }
          }
          break; // Found a valid project, stop searching
        } catch (parseError) {
          // Continue to next possible project root
          continue;
        }
      }
    }
  } catch (error) {
    // Silently fail - don't disrupt normal operation
    // Could log to debug if needed: console.debug('Version check failed:', error);
  }
}

class ConsoleLogger {
  private db: LogDatabase;
  private processName: string;
  private command: string[];
  private rawCommand: string; // Store the original command string
  private processId?: number;
  private childProcess?: ChildProcess;
  private useShell: boolean; // Flag to determine if we should use shell

  constructor(
    processName: string,
    command: string[],
    logDirectory?: string,
    useShell: boolean = false,
  ) {
    this.processName = processName;
    this.command = command;
    this.rawCommand = this.reconstructCommand(command);
    this.useShell = useShell;

    const defaultLogDir =
      logDirectory ||
      process.env.CONSOLE_LOG_DIR ||
      path.join(os.homedir(), ".console-logs");

    this.db = new LogDatabase(defaultLogDir);

    // Auto-prune old logs if configured
    this.performAutoPruning();
  }

  private performAutoPruning(): void {
    const maxAgeHours = process.env.CONSOLE_LOG_MAX_AGE_HOURS;
    // Default to 2 weeks (336 hours) if not specified
    const ageHours =
      maxAgeHours && !isNaN(Number(maxAgeHours)) ? Number(maxAgeHours) : 336;

    try {
      const result = this.db.pruneOldLogs(ageHours);
      if (result.deletedLogs > 0 || result.deletedProcesses > 0) {
        const sourceMsg = maxAgeHours
          ? `configured ${ageHours}h`
          : `default ${ageHours}h (2 weeks)`;
        console.log(
          `📝 Auto-pruned ${result.deletedLogs} old log entries and ${result.deletedProcesses} orphaned processes (older than ${sourceMsg})`,
        );
      }
    } catch (error) {
      console.warn(`⚠️  Failed to auto-prune logs: ${error}`);
    }
  }

  // Properly reconstruct command string, preserving quotes for complex arguments
  private reconstructCommand(command: string[]): string {
    return command
      .map((arg) => {
        // If the argument contains spaces, operators, or special characters, quote it
        if (
          arg.includes(" ") ||
          arg.includes("&&") ||
          arg.includes("||") ||
          arg.includes(";") ||
          arg.includes("|") ||
          arg.includes("$") ||
          arg.includes("`") ||
          arg.includes(">") ||
          arg.includes("<")
        ) {
          // Escape any existing quotes and wrap in quotes
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      })
      .join(" ");
  }

  // Check if command is already a shell invocation (like sh -c, bash -c, etc.)
  private isShellCommand(command: string[]): boolean {
    if (command.length < 2) return false;
    const firstArg = command[0];
    const secondArg = command[1];

    // Check for common shell invocation patterns
    return (
      (firstArg === "sh" ||
        firstArg === "bash" ||
        firstArg === "zsh" ||
        firstArg === "/bin/sh" ||
        firstArg === "/bin/bash" ||
        firstArg === "/bin/zsh") &&
      secondArg === "-c"
    );
  }

  // Check if command might need TTY for interactive features
  private mightNeedTTY(commandString: string): boolean {
    const interactiveTools = [
      "fastlane",
      "bundle",
      "rake",
      "rails",
      "npm",
      "yarn",
      "pnpm",
      "pod",
      "xcodebuild",
      "vim",
      "nano",
      "emacs",
      "less",
      "more",
      "man",
      "sudo",
      "su",
    ];

    return interactiveTools.some((tool) => commandString.includes(tool));
  }

  // Check if command contains shell operators that require shell execution
  private needsShell(commandString: string): boolean {
    const shellOperators = [
      "&&",
      "||",
      ";",
      "|",
      ">",
      ">>",
      "<",
      "$",
      "`",
      "$(",
      "${",
      "eval",
      "source",
      ".",
      "&&",
      "||",
      "&",
      "cd ",
      "export ",
      "set ",
      "unset ",
      '"$(',
      "'$(",
      "rbenv",
      "bundle",
    ];

    return shellOperators.some((op) => commandString.includes(op));
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
    // Determine if we need shell mode
    const isAlreadyShellCommand = this.isShellCommand(this.command);
    const needsShell =
      !isAlreadyShellCommand &&
      (this.useShell || this.needsShell(this.rawCommand));

    console.log(
      `🚀 Starting process "${this.processName}": ${this.rawCommand}`,
    );
    console.log(`📝 Logging to SQLite database in: ${this.db["db"].name}`);
    if (needsShell) {
      console.log(`🐚 Using shell mode for complex command`);
    } else if (isAlreadyShellCommand) {
      console.log(`🐚 Direct shell command detected`);
    }
    console.log("=====================================\n");

    // Choose spawn parameters based on command type
    let spawnOptions: any;
    let commandToRun: string;
    let argsToUse: string[];

    if (needsShell) {
      // Use shell to handle complex commands
      const shell = process.env.SHELL || "/bin/zsh"; // Default to zsh on macOS
      commandToRun = shell;
      argsToUse = ["-c", this.rawCommand];

      // Set up environment for potentially interactive commands
      const processEnv = { ...process.env };
      if (this.mightNeedTTY(this.rawCommand)) {
        processEnv.CI = "true";
        processEnv.FASTLANE_DISABLE_COLORS = "true";
        processEnv.FASTLANE_SKIP_UPDATE_CHECK = "true";
        processEnv.FASTLANE_OPT_OUT_USAGE = "true";
        processEnv.BUNDLE_SILENCE_ROOT_WARNING = "1";
      }

      spawnOptions = {
        stdio: ["inherit", "pipe", "pipe"],
        env: processEnv,
        shell: false, // We're manually invoking shell
      };
    } else {
      // Use direct spawn for simple commands or commands that are already shell invocations
      const [command, ...args] = this.command;
      commandToRun = command;
      argsToUse = args;

      // Check if this might be an interactive command (fastlane, bundle, etc.)
      const isInteractiveCommand = this.mightNeedTTY(this.rawCommand);

      // Set up environment for potentially interactive commands
      const processEnv = { ...process.env };
      if (isInteractiveCommand) {
        // Set environment variables to help tools run in non-interactive mode
        processEnv.CI = "true";
        processEnv.FASTLANE_DISABLE_COLORS = "true";
        processEnv.FASTLANE_SKIP_UPDATE_CHECK = "true";
        processEnv.FASTLANE_OPT_OUT_USAGE = "true";
        processEnv.BUNDLE_SILENCE_ROOT_WARNING = "1";
      }

      spawnOptions = {
        stdio: ["inherit", "pipe", "pipe"],
        env: processEnv,
        shell: false,
      };
    }

    this.childProcess = spawn(commandToRun, argsToUse, spawnOptions);

    // Create process record in database
    this.processId = this.db.createProcess({
      name: this.processName,
      command: this.rawCommand, // Store the original command
      start_time: new Date().toISOString(),
      status: "running",
      pid: this.childProcess.pid,
    });

    // Log process start
    const modeInfo = needsShell
      ? " [shell mode]"
      : isAlreadyShellCommand
      ? " [direct shell]"
      : "";
    this.addLogEntry(
      "info",
      `Process started: ${this.rawCommand} (PID: ${this.childProcess.pid})${modeInfo}`,
      `Process started: ${this.rawCommand} (PID: ${this.childProcess.pid})${modeInfo}`,
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
  console-logger [--shell] <process-name> <command> [args...]
  console-logger <process-name> "<complex-command-with-shell-operators>"

Options:
  --shell    Force shell mode for command execution (auto-detected by default)

Examples:
  console-logger "my-server" npm start
  console-logger "webpack-build" npx webpack --watch
  console-logger "python-app" python app.py
  console-logger "docker-container" docker logs -f container-name
  
  # Complex commands (shell mode auto-detected):
  console-logger "deploy" "cd ios && eval \\"\\$(rbenv init -)\\"; bundle install && bundle exec fastlane ios testflightdeploy"
  console-logger "build-and-test" "npm run build && npm test && echo 'All done!'"
  console-logger "env-setup" "export NODE_ENV=production && node server.js"

Environment Variables:
  CONSOLE_LOG_DIR - Directory to store log database (default: ~/.console-logs)
  CONSOLE_LOG_MAX_AGE_HOURS - Auto-prune logs older than this many hours (default: 336 = 2 weeks)

The logger will:
1. Auto-detect complex commands that need shell execution (&&, ||, ;, eval, $(), etc.)
2. Start your command and display output in the console
3. Simultaneously log all output to a SQLite database
4. Each log entry includes timestamp, level, source (stdout/stderr), and metadata
5. The MCP server can then search and analyze these logs with fast SQL queries
6. Auto-prune old logs (default: 2 weeks, override with CONSOLE_LOG_MAX_AGE_HOURS)

Note: For complex commands with shell operators, wrap the entire command in quotes.
`);
}

async function main() {
  // Check for updates before running
  checkForUpdates();

  const args = process.argv.slice(2);

  if (args.length < 2) {
    printUsage();
    process.exit(1);
  }

  let useShell = false;
  let processName: string;
  let command: string[];

  // Check for --shell flag
  if (args[0] === "--shell") {
    useShell = true;
    [, processName, ...command] = args;
  } else {
    [processName, ...command] = args;
  }

  if (!processName || command.length === 0) {
    printUsage();
    process.exit(1);
  }

  const logger = new ConsoleLogger(processName, command, undefined, useShell);
  await logger.start();
}

checkForUpdates();

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
