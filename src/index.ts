#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LogDatabase } from "./database.js";
import * as path from "path";
import * as os from "os";

class ConsoleLogMCPServer {
  private server: Server;
  private db: LogDatabase;

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
    const defaultLogDir =
      process.env.CONSOLE_LOG_DIR || path.join(os.homedir(), ".console-logs");
    this.db = new LogDatabase(defaultLogDir);

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_logs",
            description:
              "Search through console log files using full-text search",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query (supports FTS5 syntax)",
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
                limit: {
                  type: "number",
                  description:
                    "Optional: Limit number of results (default: 20)",
                },
                process: {
                  type: "string",
                  description: "Optional: Filter by specific process name",
                },
              },
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
            },
          },
          {
            name: "tail_process_logs",
            description: "Get latest log entries from a specific process",
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
            description: "Get summary of log activity across all processes",
            inputSchema: {
              type: "object",
              properties: {
                hours: {
                  type: "number",
                  description: "Number of hours to summarize (default: 24)",
                },
              },
            },
          },
        ],
      };
    });
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_logs": {
            const {
              query,
              process: processName,
              level,
              since,
              limit = 50,
            } = args as {
              query: string;
              process?: string;
              level?: string;
              since?: string;
              limit?: number;
            };

            const results = this.db.searchLogs(
              query,
              limit,
              processName,
              level,
              since,
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };
          }

          case "get_recent_errors": {
            const {
              hours = 1,
              limit = 20,
              process: processName,
            } = args as {
              hours?: number;
              limit?: number;
              process?: string;
            };

            const errors = this.db.getRecentErrors(hours, limit, processName);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(errors, null, 2),
                },
              ],
            };
          }

          case "list_processes": {
            const { active_only = false } = args as { active_only?: boolean };
            const processes = this.db.getAllProcesses(active_only);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(processes, null, 2),
                },
              ],
            };
          }

          case "tail_process_logs": {
            const {
              process: processName,
              lines = 20,
              level,
            } = args as {
              process: string;
              lines?: number;
              level?: string;
            };

            const logs = this.db.getProcessLogs(processName, lines, level);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(logs, null, 2),
                },
              ],
            };
          }

          case "get_log_summary": {
            const { hours = 24 } = args as { hours?: number };
            const summary = this.db.getLogSummary(hours);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(summary, null, 2),
                },
              ],
            };
          }

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
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Console MCP server running on stdio");
  }
}

const server = new ConsoleLogMCPServer();
server.run().catch(console.error);
