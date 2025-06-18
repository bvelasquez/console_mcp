#!/usr/bin/env node

import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

function injectBuildInfo() {
  console.log('🔨 Building TypeScript...');
  
  // Run TypeScript compilation
  execSync('tsc', { cwd: projectRoot, stdio: 'inherit' });
  
  console.log('⏰ Injecting build timestamp...');
  
  // Generate build info
  const buildInfo = {
    timestamp: new Date().toISOString(),
    version: JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).version,
    buildNumber: Date.now()
  };
  
  // Inject build info into logger.js
  const loggerPath = join(projectRoot, 'build', 'logger.js');
  let loggerContent = readFileSync(loggerPath, 'utf8');
  
  // Add build info constant at the top after the shebang
  const buildInfoConstant = `
// BUILD_INFO: Auto-generated during build - do not edit
const BUILD_INFO = ${JSON.stringify(buildInfo, null, 2)};
`;
  
  // Insert after the shebang line
  const lines = loggerContent.split('\n');
  lines.splice(1, 0, buildInfoConstant);
  loggerContent = lines.join('\n');
  
  writeFileSync(loggerPath, loggerContent);
  
  // Also inject into index.js
  const indexPath = join(projectRoot, 'build', 'index.js');
  let indexContent = readFileSync(indexPath, 'utf8');
  const indexLines = indexContent.split('\n');
  indexLines.splice(1, 0, buildInfoConstant);
  indexContent = indexLines.join('\n');
  writeFileSync(indexPath, indexContent);
  
  console.log('📦 Making files executable...');
  execSync('chmod +x build/index.js build/logger.js', { cwd: projectRoot });
  
  console.log(`✅ Build complete! Timestamp: ${buildInfo.timestamp}`);
}

injectBuildInfo();
