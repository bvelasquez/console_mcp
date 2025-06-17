<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is an MCP (Model Context Protocol) server project that provides a bridge between external console processes and Copilot through log file search capabilities.

You can find more info and examples at https://modelcontextprotocol.io/llms-full.txt

## Project Structure

- `src/index.ts` - Main MCP server that provides tools to search console logs
- `src/logger.ts` - Console logger utility that wraps commands and captures output
- The system consists of two main components:
  1. A console logger that captures output from any command and logs it to structured JSON files
  2. An MCP server that provides search tools to analyze these logs

## Key Features

- **Console Logger**: Wraps any command and captures stdout/stderr to JSON log files
- **MCP Server Tools**:
  - `search_logs` - Search through all console logs for specific text/patterns
  - `get_recent_errors` - Get recent error messages from all processes
  - `list_processes` - List all processes that have console logs
  - `tail_process_logs` - Get latest entries from a specific process
  - `get_log_summary` - Get summary of log activity across all processes

## Usage

1. Use the console logger to start processes: `console-logger "process-name" command args...`
2. The MCP server provides tools to search and analyze the captured logs
3. This creates a bridge between external console processes and Copilot for debugging

Refer to https://github.com/modelcontextprotocol/create-python-server for additional SDK guidance.
