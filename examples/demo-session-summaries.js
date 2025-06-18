#!/usr/bin/env node

/**
 * Complete demo of the session summary feature
 */

import { LogDatabase } from "./build/database.js";
import { getGitInfo } from "./build/git-utils.js";
import * as path from "path";
import * as os from "os";

async function demonstrateSessionSummaries() {
  console.log("🚀 Console MCP Session Summary Demo\n");

  const testLogDir = path.join(os.tmpdir(), "demo-console-logs");
  const db = new LogDatabase(testLogDir);

  try {
    // Get current project info
    const gitInfo = getGitInfo();
    console.log(`📁 Current project: ${gitInfo.projectName}`);
    console.log(`📄 Changed files: ${gitInfo.changedFiles.length} files`);
    if (gitInfo.changedFiles.length > 0) {
      console.log(
        `   Files: ${gitInfo.changedFiles.slice(0, 3).join(", ")}${
          gitInfo.changedFiles.length > 3 ? "..." : ""
        }`,
      );
    }

    // Create sample session summaries
    console.log("\n🔨 Creating session summaries...");

    const summaries = [
      {
        title: "Implemented Session Summary Feature",
        description: `# Session Summary Feature Implementation

## Overview
Added comprehensive session summary functionality to the Console MCP server.

## Key Features Implemented
- **Database Schema**: Added \`session_summaries\` table with FTS5 search
- **MCP Tools**: Created 6 new tools for managing summaries
- **Git Integration**: Auto-detection of project name and changed files
- **Search Capabilities**: Full-text search across titles, descriptions, and tags

## Technical Details
- Used SQLite FTS5 for high-performance text search
- Implemented proper database indexing for fast queries
- Added comprehensive error handling and fallback strategies
- Created robust git utilities for project detection

## Files Modified
- \`src/database.ts\` - Added SessionSummary interface and database methods
- \`src/index.ts\` - Added MCP tools for session management
- \`src/git-utils.ts\` - Created utilities for git integration
- \`README.md\` - Added comprehensive documentation`,
        tags: [
          "feature-implementation",
          "database-schema",
          "mcp-tools",
          "git-integration",
        ],
        project: gitInfo.projectName,
        llm_model: "claude-3.5-sonnet",
        files_changed: gitInfo.changedFiles,
      },
      {
        title: "Fixed Git Utils Error Handling",
        description: `# Git Utilities Improvement

## Problem
Git commands were failing when repositories had few commits (HEAD~5 reference didn't exist).

## Solution
Implemented cascading fallback strategy:
1. Try \`HEAD~5..HEAD\` for recent commits
2. Fallback to \`HEAD~1..HEAD\` for single commit
3. Fallback to \`git ls-files --modified\` for tracked changes
4. Final fallback to empty array

## Result
- Robust git detection in all repository states
- Better error handling and user experience
- Maintains functionality across different git histories`,
        tags: ["bug-fix", "git-utils", "error-handling"],
        project: gitInfo.projectName,
        llm_model: "claude-3.5-sonnet",
        files_changed: ["src/git-utils.ts"],
      },
      {
        title: "Added Comprehensive Documentation",
        description: `# Documentation Update

## Added
- Complete session summary feature documentation
- Usage examples and code samples
- Configuration instructions
- Use cases and benefits

## Sections Added
- Session Summaries overview
- Auto-detection features
- Searching capabilities
- Use cases for team collaboration`,
        tags: ["documentation", "readme-update", "user-experience"],
        project: gitInfo.projectName,
        llm_model: "claude-3.5-sonnet",
        files_changed: ["README.md"],
      },
    ];

    const summaryIds = [];
    for (const summary of summaries) {
      const sessionSummary = {
        ...summary,
        tags: JSON.stringify(summary.tags),
        timestamp: new Date().toISOString(),
        files_changed: JSON.stringify(summary.files_changed),
      };

      const id = db.createSessionSummary(sessionSummary);
      summaryIds.push(id);
      console.log(`  ✓ Created: "${summary.title}" (ID: ${id})`);
    }

    // Demonstrate search capabilities
    console.log("\n🔍 Demonstrating search capabilities...");

    // 1. Full-text search
    console.log('\n1. Searching for "git" related summaries:');
    const gitResults = db.searchSessionSummaries("git", 10);
    gitResults.forEach((result) => {
      console.log(
        `   📝 ${result.title} (${JSON.parse(result.tags).join(", ")})`,
      );
    });

    // 2. Search by project
    console.log("\n2. Getting summaries for current project:");
    const projectResults = db.getSessionSummariesByProject(
      gitInfo.projectName,
      10,
    );
    console.log(
      `   📁 Found ${projectResults.length} summaries for "${gitInfo.projectName}"`,
    );

    // 3. Search by tags
    console.log('\n3. Searching by tags ["feature-implementation"]:');
    const tagResults = db.getSessionSummariesByTags(
      ["feature-implementation"],
      10,
    );
    tagResults.forEach((result) => {
      console.log(`   🏷️  ${result.title}`);
    });

    // 4. Recent summaries
    console.log("\n4. Recent summaries (last 24 hours):");
    const recentResults = db.getRecentSessionSummaries(24, 10);
    console.log(`   ⏰ Found ${recentResults.length} recent summaries`);

    // 5. List projects
    console.log("\n5. All projects with summaries:");
    const projects = db.getAllProjects();
    projects.forEach((project) => {
      console.log(`   📂 ${project}`);
    });

    console.log("\n✨ Session Summary Demo Complete!");
    console.log("\n💡 This demonstrates how Copilot can now:");
    console.log("   • Store context between sessions");
    console.log("   • Search development history");
    console.log("   • Share insights across VS Code instances");
    console.log("   • Maintain project knowledge over time");
  } catch (error) {
    console.error("❌ Demo failed:", error);
  } finally {
    db.close();
  }
}

// Run demo
demonstrateSessionSummaries().catch(console.error);
