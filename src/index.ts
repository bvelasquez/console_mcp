#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { LogDatabase } from "./database.js";
import { getGitInfo } from "./git-utils.js";
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
          {
            name: "create_session_summary",
            description:
              "Create a session summary that can be searched by future Copilot sessions",
            inputSchema: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "Title of the session summary",
                },
                description: {
                  type: "string",
                  description:
                    "Detailed description of the session (can be markdown)",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of tags for categorizing the summary",
                },
                project: {
                  type: "string",
                  description:
                    "Optional: Project name (auto-detected from git/package.json if not provided)",
                },
                llm_model: {
                  type: "string",
                  description: "Optional: LLM model used during the session",
                },
                files_changed: {
                  type: "array",
                  items: { type: "string" },
                  description:
                    "Optional: Array of file paths (auto-detected from git if not provided)",
                },
                workspace_root: {
                  type: "string",
                  description:
                    "Optional: Root directory of the workspace for auto-detection",
                },
              },
              required: ["title", "description"],
            },
          },
          {
            name: "search_session_summaries",
            description:
              "Search through session summaries for context and insights",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description:
                    "Search query to find relevant session summaries",
                },
                project: {
                  type: "string",
                  description: "Optional: Filter by specific project",
                },
                since: {
                  type: "string",
                  description:
                    "Optional: Search summaries since this timestamp (ISO format)",
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
            name: "get_session_summaries_by_project",
            description: "Get session summaries for a specific project",
            inputSchema: {
              type: "object",
              properties: {
                project: {
                  type: "string",
                  description: "Project name to get summaries for",
                },
                limit: {
                  type: "number",
                  description:
                    "Optional: Limit number of results (default: 50)",
                },
              },
              required: ["project"],
            },
          },
          {
            name: "get_session_summaries_by_tags",
            description: "Get session summaries by tags",
            inputSchema: {
              type: "object",
              properties: {
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Array of tags to search for",
                },
                limit: {
                  type: "number",
                  description:
                    "Optional: Limit number of results (default: 50)",
                },
              },
              required: ["tags"],
            },
          },
          {
            name: "get_recent_session_summaries",
            description: "Get recent session summaries",
            inputSchema: {
              type: "object",
              properties: {
                hours: {
                  type: "number",
                  description: "Number of hours to look back (default: 24)",
                },
                limit: {
                  type: "number",
                  description:
                    "Optional: Limit number of results (default: 50)",
                },
              },
            },
          },
          {
            name: "list_projects",
            description: "List all projects that have session summaries",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
          {
            name: "prune_old_logs",
            description:
              "Remove old console logs from the database to free up space. Only affects console logs, not session summaries.",
            inputSchema: {
              type: "object",
              properties: {
                max_age_hours: {
                  type: "number",
                  description:
                    "Maximum age of logs to keep in hours (e.g., 168 for 1 week, 720 for 1 month)",
                },
                dry_run: {
                  type: "boolean",
                  description:
                    "Optional: If true, shows what would be deleted without actually deleting (default: false)",
                },
              },
              required: ["max_age_hours"],
            },
          },
          {
            name: "get_log_statistics",
            description:
              "Get statistics about the console logs database including size and age",
            inputSchema: {
              type: "object",
              properties: {},
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

          case "create_session_summary": {
            const {
              title,
              description,
              tags = [],
              project,
              llm_model,
              files_changed,
              workspace_root,
            } = args as {
              title: string;
              description: string;
              tags?: string[];
              project?: string;
              llm_model?: string;
              files_changed?: string[];
              workspace_root?: string;
            };

            // Auto-detect project info if not provided
            const gitInfo = getGitInfo(workspace_root);
            const finalProject = project || gitInfo.projectName;
            const finalFilesChanged = files_changed || gitInfo.changedFiles;

            const sessionSummary = {
              title,
              description,
              tags: JSON.stringify(tags),
              timestamp: new Date().toISOString(),
              project: finalProject,
              llm_model,
              files_changed: JSON.stringify(finalFilesChanged),
            };

            const id = this.db.createSessionSummary(sessionSummary);

            return {
              content: [
                {
                  type: "text",
                  text: `Session summary created with ID: ${id}\nProject: ${finalProject}\nFiles changed: ${finalFilesChanged.length} files`,
                },
              ],
            };
          }

          case "search_session_summaries": {
            const {
              query,
              project,
              since,
              limit = 50,
            } = args as {
              query: string;
              project?: string;
              since?: string;
              limit?: number;
            };

            const results = this.db.searchSessionSummaries(
              query,
              limit,
              project,
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

          case "get_session_summaries_by_project": {
            const { project, limit = 50 } = args as {
              project: string;
              limit?: number;
            };

            const results = this.db.getSessionSummariesByProject(
              project,
              limit,
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

          case "get_session_summaries_by_tags": {
            const { tags, limit = 50 } = args as {
              tags: string[];
              limit?: number;
            };

            const results = this.db.getSessionSummariesByTags(tags, limit);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };
          }

          case "get_recent_session_summaries": {
            const { hours = 24, limit = 50 } = args as {
              hours?: number;
              limit?: number;
            };

            const results = this.db.getRecentSessionSummaries(hours, limit);

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(results, null, 2),
                },
              ],
            };
          }

          case "list_projects": {
            const projects = this.db.getAllProjects();

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(projects, null, 2),
                },
              ],
            };
          }

          case "prune_old_logs": {
            if (!args) {
              throw new Error("Missing required arguments");
            }

            const maxAgeHours = args.max_age_hours as number;
            const dryRun = (args.dry_run as boolean) || false;

            if (dryRun) {
              // For dry run, count what would be deleted
              const cutoffTime = new Date(
                Date.now() - maxAgeHours * 60 * 60 * 1000,
              ).toISOString();

              // Count logs that would be deleted
              const countStmt = this.db["db"].prepare(`
                SELECT COUNT(*) as count FROM log_entries
                WHERE timestamp < ?
              `);
              const logsToDeleteCount = (
                countStmt.get(cutoffTime) as { count: number }
              ).count;

              // Count processes that would become orphaned
              const orphanCountStmt = this.db["db"].prepare(`
                SELECT COUNT(DISTINCT p.id) as count FROM processes p
                WHERE NOT EXISTS (
                  SELECT 1 FROM log_entries le 
                  WHERE le.process_id = p.id AND le.timestamp >= ?
                )
              `);
              const processesToDeleteCount = (
                orphanCountStmt.get(cutoffTime) as { count: number }
              ).count;

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        dry_run: true,
                        max_age_hours: maxAgeHours,
                        cutoff_time: cutoffTime,
                        logs_that_would_be_deleted: logsToDeleteCount,
                        processes_that_would_be_deleted: processesToDeleteCount,
                        message: `DRY RUN: Would delete ${logsToDeleteCount} log entries and ${processesToDeleteCount} orphaned processes older than ${maxAgeHours} hours`,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            } else {
              const result = this.db.pruneOldLogs(maxAgeHours);

              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        max_age_hours: maxAgeHours,
                        deleted_logs: result.deletedLogs,
                        deleted_processes: result.deletedProcesses,
                        message: `Successfully deleted ${result.deletedLogs} old log entries and ${result.deletedProcesses} orphaned processes`,
                      },
                      null,
                      2,
                    ),
                  },
                ],
              };
            }
          }

          case "get_log_statistics": {
            const stats = this.db.getLogStatistics();

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      ...stats,
                      disk_usage_mb:
                        Math.round((stats.diskUsageKB / 1024) * 100) / 100,
                      age_info:
                        stats.oldestLog && stats.newestLog
                          ? {
                              oldest_log_age_hours: Math.round(
                                (new Date().getTime() -
                                  new Date(stats.oldestLog).getTime()) /
                                  (1000 * 60 * 60),
                              ),
                              newest_log_age_hours: Math.round(
                                (new Date().getTime() -
                                  new Date(stats.newestLog).getTime()) /
                                  (1000 * 60 * 60),
                              ),
                            }
                          : null,
                    },
                    null,
                    2,
                  ),
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
