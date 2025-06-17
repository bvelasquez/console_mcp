import { execSync } from "child_process";
import * as path from "path";

export interface GitInfo {
  changedFiles: string[];
  projectName: string;
}

/**
 * Get information about changed files from git
 */
export function getGitChangedFiles(workspaceRoot?: string): string[] {
  try {
    const cwd = workspaceRoot || process.cwd();

    // Get unstaged changes
    const unstagedFiles = execSync("git diff --name-only", {
      cwd,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    // Get staged changes
    const stagedFiles = execSync("git diff --cached --name-only", {
      cwd,
      encoding: "utf-8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);

    // Get files from recent commits (try different strategies)
    let recentFiles: string[] = [];
    try {
      // Try to get files from last 5 commits
      recentFiles = execSync("git diff --name-only HEAD~5..HEAD", {
        cwd,
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      try {
        // Fallback: try to get files from last commit only
        recentFiles = execSync("git diff --name-only HEAD~1..HEAD", {
          cwd,
          encoding: "utf-8",
        })
          .trim()
          .split("\n")
          .filter(Boolean);
      } catch {
        // Fallback: get all files that have been added/modified
        try {
          recentFiles = execSync(
            "git ls-files --modified --others --exclude-standard",
            {
              cwd,
              encoding: "utf-8",
            },
          )
            .trim()
            .split("\n")
            .filter(Boolean);
        } catch {
          // Final fallback: empty array
          recentFiles = [];
        }
      }
    }

    // Combine and deduplicate
    const allFiles = [
      ...new Set([...unstagedFiles, ...stagedFiles, ...recentFiles]),
    ];

    return allFiles;
  } catch (error) {
    console.error("Error getting git changed files:", error);
    return [];
  }
}

/**
 * Get project name from package.json or git repository name
 */
export function getProjectName(workspaceRoot?: string): string {
  try {
    const cwd = workspaceRoot || process.cwd();

    // Try to get from package.json first
    try {
      const packageJsonPath = path.join(cwd, "package.json");
      const packageJson = require(packageJsonPath);
      if (packageJson.name) {
        return packageJson.name;
      }
    } catch {
      // Ignore if package.json doesn't exist
    }

    // Fallback to git repository name
    const remoteUrl = execSync("git config --get remote.origin.url", {
      cwd,
      encoding: "utf-8",
    }).trim();

    // Extract repository name from URL
    const match = remoteUrl.match(/\/([^\/]+)\.git$/);
    if (match) {
      return match[1];
    }

    // Fallback to directory name
    return path.basename(cwd);
  } catch (error) {
    console.error("Error getting project name:", error);
    // Fallback to directory name
    return path.basename(workspaceRoot || process.cwd());
  }
}

/**
 * Get comprehensive git information for session summary
 */
export function getGitInfo(workspaceRoot?: string): GitInfo {
  return {
    changedFiles: getGitChangedFiles(workspaceRoot),
    projectName: getProjectName(workspaceRoot),
  };
}
