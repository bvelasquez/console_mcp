# Console MCP Tests

This directory contains test files for the Console MCP server functionality.

## Test Files

### Core Functionality Tests

- `test-log-pruning.js` - Tests the log pruning functionality including database operations
- `test-mcp-tools.js` - Tests the basic MCP server tools and functionality
- `test-mcp-pruning.js` - Tests the MCP pruning tools specifically

### Session Management Tests

- `test-session-summaries.js` - Tests session summary creation and retrieval
- `test-mcp-session-tools.js` - Tests MCP session-related tools

## Running Tests

All tests are standalone Node.js scripts that can be run directly:

```bash
# Run individual tests
node tests/test-log-pruning.js
node tests/test-mcp-tools.js
node tests/test-session-summaries.js

# Run all tests
for test in tests/test-*.js; do
  echo "Running $test..."
  node "$test"
  echo "---"
done
```

## Test Environment

Tests use temporary directories and don't affect your main console logs database.
Each test cleans up after itself by removing temporary files and directories.
