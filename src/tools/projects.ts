import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tool } from '@opencode-ai/plugin';
import type { PluginConfig } from '../config.js';
import { withUserConfirmation } from './wrappers.js';

export function buildProjectTools(config: PluginConfig, allowedTools: Set<string>) {
  return {
    list_projects: withUserConfirmation('list_projects', allowedTools, {
      description: 'List available projects in projects directory',
      args: {},
      async execute() {
        const projectsDir = config.projectsDirectory;
        const entries = readdirSync(projectsDir, { withFileTypes: true });
        const projects = entries
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
          .map((entry) => entry.name);
        return JSON.stringify(projects);
      },
    }),

    run_project_command: withUserConfirmation('run_project_command', allowedTools, {
      description: 'Run an allowlisted command in a project directory',
      args: {
        project: tool.schema.string().describe('Project name'),
        command: tool.schema
          .enum(['npm test', 'npm run build', 'npm run lint', 'npm install', 'git status'])
          .describe('Command to run'),
      },
      async execute(args: Record<string, unknown>) {
        const { project, command } = args as { project: string; command: string };
        const projectPath = join(config.projectsDirectory, project);
        if (!existsSync(projectPath)) {
          return `Error: Project '${project}' not found`;
        }
        try {
          const output = execSync(command, {
            cwd: projectPath,
            timeout: 60000,
            encoding: 'utf8',
          });
          return output.slice(0, 4000);
        } catch (error: unknown) {
          const err = error as { message?: string; stderr?: string };
          return `Error: ${err.message || 'Command failed'}\n${err.stderr || ''}`.slice(0, 4000);
        }
      },
    }),
  };
}
