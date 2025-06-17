#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { promises as fs, readFileSync, existsSync } from "fs";
import * as path from "path";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  process: string;
  command?: string;
  pid?: number;
  source: "stdout" | "stderr";
}

interface LogFile {
  path: string;
  process: string;
  lastModified: Date;
  entries: LogEntry[];
}

class ConsoleLogMCPServer {
  private server: Server;
  private logDirectory: string;

  constructor() {
    this.server = new Server(
      {
        name: "console-log-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    // Default log directory (can be overridden via environment variable)
    this.logDirectory =
      process.env.CONSOLE_LOG_DIR || "/Users/barryvelasquez/logs";

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_logs",
            description:
              "Search through console log files for specific text or patterns",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query to find in log files",
                },
                process: {
                  type: "string",
                  description: "Optional: Filter by specific process name",
                },
                level: {
                  type: "string",
                  description:
                    "Optional: Filter by log level (error, warn, info, debug)",
                },
                since: {
                  type: "string",
                  description:
                    "Optional: Search logs since this timestamp (ISO format)",
                },
                limit: {
                  type: "number",
                  description:
                    "Optional: Limit number of results (default: 50)",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "get_recent_errors",
            description: "Get recent error messages from all console logs",
            inputSchema: {
              type: "object",
              properties: {
                hours: {
                  type: "number",
                  description: "Number of hours to look back (default: 1)",
                },
                process: {
                  type: "string",
                  description: "Optional: Filter by specific process name",
                },
                limit: {
                  type: "number",
                  description:
                    "Optional: Limit number of results (default: 20)",
                },
              },
              required: [],
            },
          },
          {
            name: "list_processes",
            description: "List all processes that have console logs",
            inputSchema: {
              type: "object",
              properties: {
                active_only: {
                  type: "boolean",
                  description:
                    "Only show processes with recent activity (default: false)",
                },
              },
              required: [],
            },
          },
          {
            name: "tail_process_logs",
            description: "Get the latest log entries from a specific process",
            inputSchema: {
              type: "object",
              properties: {
                process: {
                  type: "string",
                  description: "Process name to tail logs for",
                },
                lines: {
                  type: "number",
                  description: "Number of lines to return (default: 20)",
                },
                level: {
                  type: "string",
                  description: "Optional: Filter by log level",
                },
              },
              required: ["process"],
            },
          },
          {
            name: "get_log_summary",
            description: "Get a summary of log activity across all processes",
            inputSchema: {
              type: "object",
              properties: {
                hours: {
                  type: "number",
                  description: "Number of hours to summarize (default: 24)",
                },
              },
              required: [],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_logs":
            return await this.searchLogs(args);
          case "get_recent_errors":
            return await this.getRecentErrors(args);
          case "list_processes":
            return await this.listProcesses(args);
          case "tail_process_logs":
            return await this.tailProcessLogs(args);
          case "get_log_summary":
            return await this.getLogSummary(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    });
  }

  private async ensureLogDirectory(): Promise<void> {
    try {
      await fs.access(this.logDirectory);
    } catch {
      await fs.mkdir(this.logDirectory, { recursive: true });
    }
  }

  private async readLogFiles(): Promise<LogFile[]> {
    await this.ensureLogDirectory();

    const files = await fs.readdir(this.logDirectory);
    const logFiles: LogFile[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(this.logDirectory, file);
        try {
          const stats = await fs.stat(filePath);
          const content = await fs.readFile(filePath, "utf8");
          const lines = content
            .trim()
            .split("\n")
            .filter((line) => line.trim());
          const entries: LogEntry[] = [];

          for (const line of lines) {
            try {
              const entry = JSON.parse(line) as LogEntry;
              entries.push(entry);
            } catch (e) {
              // Skip invalid JSON lines
            }
          }

          logFiles.push({
            path: filePath,
            process: path.basename(file, ".json"),
            lastModified: stats.mtime,
            entries,
          });
        } catch (e) {
          // Skip files that can't be read
        }
      }
    }

    return logFiles;
  }

  private async searchLogs(args: any) {
    const { query, process: processFilter, level, since, limit = 50 } = args;
    const logFiles = await this.readLogFiles();
    let results: (LogEntry & { process: string })[] = [];

    const sinceDate = since ? new Date(since) : null;

    for (const logFile of logFiles) {
      if (processFilter && logFile.process !== processFilter) {
        continue;
      }

      for (const entry of logFile.entries) {
        if (level && entry.level !== level) {
          continue;
        }

        if (sinceDate && new Date(entry.timestamp) < sinceDate) {
          continue;
        }

        if (entry.message.toLowerCase().includes(query.toLowerCase())) {
          results.push({ ...entry, process: logFile.process });
        }
      }
    }

    // Sort by timestamp (newest first) and limit
    results.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    results = results.slice(0, limit);

    const content =
      results.length > 0
        ? results
            .map(
              (entry) =>
                `[${entry.timestamp}] ${entry.process} (${entry.level}): ${entry.message}`,
            )
            .join("\n")
        : `No logs found matching query: "${query}"`;

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  }

  private async getRecentErrors(args: any) {
    const { hours = 1, process: processFilter, limit = 20 } = args;
    const logFiles = await this.readLogFiles();
    let errors: (LogEntry & { process: string })[] = [];

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    for (const logFile of logFiles) {
      if (processFilter && logFile.process !== processFilter) {
        continue;
      }

      for (const entry of logFile.entries) {
        if (entry.level === "error" && new Date(entry.timestamp) >= since) {
          errors.push({ ...entry, process: logFile.process });
        }
      }
    }

    // Sort by timestamp (newest first) and limit
    errors.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    errors = errors.slice(0, limit);

    const content =
      errors.length > 0
        ? errors
            .map(
              (entry) =>
                `[${entry.timestamp}] ${entry.process}: ${entry.message}`,
            )
            .join("\n")
        : `No errors found in the last ${hours} hour(s)`;

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  }

  private async listProcesses(args: any) {
    const { active_only = false } = args;
    const logFiles = await this.readLogFiles();

    const processes = logFiles
      .map((logFile) => {
        const lastEntry = logFile.entries[logFile.entries.length - 1];
        const isActive = active_only
          ? Date.now() - new Date(lastEntry?.timestamp || 0).getTime() <
            5 * 60 * 1000 // 5 minutes
          : true;

        return {
          name: logFile.process,
          lastModified: logFile.lastModified.toISOString(),
          entryCount: logFile.entries.length,
          lastActivity: lastEntry?.timestamp || "unknown",
          isActive,
        };
      })
      .filter((p) => !active_only || p.isActive);

    const content =
      processes.length > 0
        ? processes
            .map(
              (p) =>
                `${p.name}: ${p.entryCount} entries, last: ${p.lastActivity}${
                  p.isActive ? " (active)" : ""
                }`,
            )
            .join("\n")
        : "No processes found";

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  }

  private async tailProcessLogs(args: any) {
    const { process: processName, lines = 20, level } = args;
    const logFiles = await this.readLogFiles();

    const logFile = logFiles.find((f) => f.process === processName);
    if (!logFile) {
      return {
        content: [
          {
            type: "text",
            text: `Process "${processName}" not found`,
          },
        ],
      };
    }

    let entries = logFile.entries;
    if (level) {
      entries = entries.filter((e) => e.level === level);
    }

    const tailEntries = entries.slice(-lines);
    const content =
      tailEntries.length > 0
        ? tailEntries
            .map(
              (entry) =>
                `[${entry.timestamp}] (${entry.level}): ${entry.message}`,
            )
            .join("\n")
        : `No log entries found for process "${processName}"`;

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  }

  private async getLogSummary(args: any) {
    const { hours = 24 } = args;
    const logFiles = await this.readLogFiles();
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const summary = {
      totalProcesses: logFiles.length,
      totalEntries: 0,
      errorCount: 0,
      warnCount: 0,
      infoCount: 0,
      processes: [] as any[],
    };

    for (const logFile of logFiles) {
      const recentEntries = logFile.entries.filter(
        (e) => new Date(e.timestamp) >= since,
      );
      const errors = recentEntries.filter((e) => e.level === "error").length;
      const warnings = recentEntries.filter((e) => e.level === "warn").length;
      const info = recentEntries.filter((e) => e.level === "info").length;

      summary.totalEntries += recentEntries.length;
      summary.errorCount += errors;
      summary.warnCount += warnings;
      summary.infoCount += info;

      summary.processes.push({
        name: logFile.process,
        entries: recentEntries.length,
        errors,
        warnings,
        info,
      });
    }

    const content = `
Log Summary (last ${hours} hours):
- Total Processes: ${summary.totalProcesses}
- Total Entries: ${summary.totalEntries}
- Errors: ${summary.errorCount}
- Warnings: ${summary.warnCount}
- Info: ${summary.infoCount}

Per Process:
${summary.processes
  .map(
    (p) =>
      `  ${p.name}: ${p.entries} entries (${p.errors} errors, ${p.warnings} warnings)`,
  )
  .join("\n")}`.trim();

    return {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
    };
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Console Log MCP Server running on stdio");
  }
}

async function main() {
  const server = new ConsoleLogMCPServer();
  await server.run();
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
