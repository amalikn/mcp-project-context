import { ProjectStore } from "./project-store.js";
import { CheckpointContext, ProjectContext, Task } from "../types/project-types.js";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { v4 as uuidv4 } from "uuid";
import { toLocalISOString } from "../utils/time.js";

const execFileAsync = promisify(execFile);

type ContextSection = "all" | "tasks" | "notes" | "decisions" | "sessions";
type ContextSort =
  | "created_desc"
  | "created_asc"
  | "updated_desc"
  | "updated_asc";

interface TokenLimitConfig {
  maxTokens: number;
  safetyBuffer: number;
  charsPerToken: number;
}

interface TokenLimitedResponse {
  text: string;
  truncated: boolean;
  estimatedTokens: number;
  safeTokenLimit: number;
}

export interface ContextFilters {
  section?: ContextSection;
  channel?: string;
  category?: string;
  taskStatus?: "todo" | "in-progress" | "blocked" | "completed";
  taskPriority?: "low" | "medium" | "high" | "critical";
  createdAfter?: string;
  createdBefore?: string;
  sort?: ContextSort;
  limit?: number;
  offset?: number;
  keyPattern?: string;
}

export class ContextManager {
  constructor(private store: ProjectStore) {}

  async getCurrentContext(
    projectId: string,
    filters?: ContextFilters
  ): Promise<string> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      return "Project not found";
    }

    const section = filters?.section || "all";
    const channel = filters?.channel;
    const offset = Math.max(0, filters?.offset || 0);
    const limit = Math.max(1, filters?.limit || 50);
    const sort = filters?.sort || "created_desc";

    const createdAfter = filters?.createdAfter
      ? new Date(filters.createdAfter)
      : null;
    const createdBefore = filters?.createdBefore
      ? new Date(filters.createdBefore)
      : null;

    let keyRegex: RegExp | null = null;
    if (filters?.keyPattern) {
      try {
        keyRegex = new RegExp(filters.keyPattern, "i");
      } catch {
        throw new Error("Invalid keyPattern regex");
      }
    }

    const projectSessions = await this.store.getProjectSessions(projectId);
    const lastSession = projectSessions[0];

    const tasks = this.paginateItems(
      this.sortItems(
        project.tasks.filter((task) => {
          if (channel && (task.channel || "general") !== channel) {
            return false;
          }
          if (filters?.taskStatus && task.status !== filters.taskStatus) {
            return false;
          }
          if (filters?.taskPriority && task.priority !== filters.taskPriority) {
            return false;
          }
          if (
            keyRegex &&
            !keyRegex.test(`${task.title} ${task.description || ""}`)
          ) {
            return false;
          }
          return this.isWithinDateRange(task.createdAt, createdAfter, createdBefore);
        }),
        sort,
        "createdAt",
        "updatedAt"
      ),
      offset,
      limit
    );

    const notes = this.paginateItems(
      this.sortItems(
        project.notes.filter((note) => {
          if (channel && (note.channel || "general") !== channel) {
            return false;
          }
          if (filters?.category && note.category !== filters.category) {
            return false;
          }
          if (keyRegex && !keyRegex.test(note.content)) {
            return false;
          }
          return this.isWithinDateRange(note.timestamp, createdAfter, createdBefore);
        }),
        sort,
        "timestamp",
        "timestamp"
      ),
      offset,
      limit
    );

    const decisions = this.paginateItems(
      this.sortItems(
        project.decisions.filter((decision) => {
          if (channel && (decision.channel || "general") !== channel) {
            return false;
          }
          if (
            filters?.category &&
            filters.category !== "decision" &&
            filters.category !== "decisions"
          ) {
            return false;
          }
          if (keyRegex && !keyRegex.test(decision.decision)) {
            return false;
          }
          return this.isWithinDateRange(
            decision.timestamp,
            createdAfter,
            createdBefore
          );
        }),
        sort,
        "timestamp",
        "timestamp"
      ),
      offset,
      limit
    );

    const sessions = this.paginateItems(
      this.sortItems(
        projectSessions.filter((session) => {
          if (channel && (session.channel || "general") !== channel) {
            return false;
          }
          if (
            keyRegex &&
            !keyRegex.test(
              `${session.goals.join(" ")} ${session.achievements.join(" ")} ${
                session.blockers.join(" ")
              }`
            )
          ) {
            return false;
          }
          return this.isWithinDateRange(
            session.startTime,
            createdAfter,
            createdBefore
          );
        }),
        sort,
        "startTime",
        "endTime"
      ),
      offset,
      limit
    );

    const sections: string[] = [];

    if (section === "all") {
      sections.push(`
# Project: ${project.name}

## Current Status: ${project.status}
${project.description}

## Current Phase: ${project.currentPhase}

## Tech Stack:
- Frontend: ${project.techStack.frontend.join(", ") || "Not specified"}
- Backend: ${project.techStack.backend.join(", ") || "Not specified"}
- Database: ${project.techStack.database.join(", ") || "Not specified"}
- Infrastructure: ${
        project.techStack.infrastructure.join(", ") || "Not specified"
      }

## Last Session Summary:
${
  lastSession
    ? `
- Goals: ${lastSession.goals.join(", ") || "None"}
- Achievements: ${lastSession.achievements.join(", ") || "None"}
- Blockers: ${lastSession.blockers.join(", ") || "None"}
- Next Session Plan: ${lastSession.nextSession.join(", ") || "None"}
`
    : "No previous sessions"
}
`.trim());
    }

    if (section === "all" || section === "tasks") {
      sections.push(`
## Tasks (${tasks.total}, showing ${tasks.items.length}):
${
  tasks.items
    .map(
      (task) =>
        `- [${task.status.toUpperCase()}] ${task.title} (Priority: ${
          task.priority
        })`
    )
    .join("\n") || "No tasks found"
}`.trim());
    }

    if (section === "all" || section === "notes") {
      sections.push(`
## Notes (${notes.total}, showing ${notes.items.length}):
${
  notes.items
    .map(
      (note) =>
        `- [${note.category || "general"}] ${note.content} (${new Date(
          note.timestamp
        ).toLocaleDateString()})`
    )
    .join("\n") || "No notes found"
}`.trim());
    }

    if (section === "all" || section === "decisions") {
      sections.push(`
## Decisions (${decisions.total}, showing ${decisions.items.length}):
${
  decisions.items
    .map(
      (decision) =>
        `- ${decision.decision} (${new Date(
          decision.timestamp
        ).toLocaleDateString()})`
    )
    .join("\n") || "No decisions found"
}`.trim());
    }

    if (section === "all" || section === "sessions") {
      sections.push(`
## Sessions (${sessions.total}, showing ${sessions.items.length}):
${
  sessions.items
    .map(
      (session) =>
        `- ${new Date(session.startTime).toLocaleString()} | Goals: ${
          session.goals.join(", ") || "None"
        } | Ended: ${session.endTime ? "Yes" : "No"}`
    )
    .join("\n") || "No sessions found"
}`.trim());
    }

    const response = this.applyTokenLimit(sections.join("\n\n"));

    if (!response.truncated) {
      return response.text;
    }

    return [
      "## Response Notice",
      `Context output was truncated to stay within safe token budget (${response.safeTokenLimit} tokens, estimated ${response.estimatedTokens} before truncation).`,
      response.text,
    ].join("\n\n");
  }

  private isWithinDateRange(
    timestamp: string,
    createdAfter: Date | null,
    createdBefore: Date | null
  ): boolean {
    const date = new Date(timestamp);
    if (createdAfter && date < createdAfter) {
      return false;
    }
    if (createdBefore && date > createdBefore) {
      return false;
    }
    return true;
  }

  private sortItems<T extends Record<string, unknown>>(
    items: T[],
    sort: ContextSort,
    createdField: keyof T,
    updatedField: keyof T
  ): T[] {
    const sorted = [...items];

    sorted.sort((first, second) => {
      const firstCreated = new Date(String(first[createdField])).getTime();
      const secondCreated = new Date(String(second[createdField])).getTime();
      const firstUpdated = new Date(
        String(first[updatedField] || first[createdField])
      ).getTime();
      const secondUpdated = new Date(
        String(second[updatedField] || second[createdField])
      ).getTime();

      switch (sort) {
        case "created_asc":
          return firstCreated - secondCreated;
        case "updated_desc":
          return secondUpdated - firstUpdated;
        case "updated_asc":
          return firstUpdated - secondUpdated;
        case "created_desc":
        default:
          return secondCreated - firstCreated;
      }
    });

    return sorted;
  }

  private paginateItems<T>(items: T[], offset: number, limit: number): {
    items: T[];
    total: number;
  } {
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
    };
  }

  private getTokenLimitConfig(): TokenLimitConfig {
    const maxTokens = Number.parseInt(process.env.MCP_MAX_TOKENS || "25000", 10);
    const safetyBuffer = Number.parseFloat(
      process.env.MCP_TOKEN_SAFETY_BUFFER || "0.8"
    );
    const charsPerToken = Number.parseFloat(
      process.env.MCP_CHARS_PER_TOKEN || "3.5"
    );

    return {
      maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 25000,
      safetyBuffer:
        Number.isFinite(safetyBuffer) && safetyBuffer > 0 && safetyBuffer <= 1
          ? safetyBuffer
          : 0.8,
      charsPerToken:
        Number.isFinite(charsPerToken) && charsPerToken > 0
          ? charsPerToken
          : 3.5,
    };
  }

  private estimateTokens(text: string, charsPerToken: number): number {
    return Math.ceil(text.length / charsPerToken);
  }

  private applyTokenLimit(text: string): TokenLimitedResponse {
    const config = this.getTokenLimitConfig();
    const safeTokenLimit = Math.floor(config.maxTokens * config.safetyBuffer);
    const estimatedTokens = this.estimateTokens(text, config.charsPerToken);

    if (estimatedTokens <= safeTokenLimit) {
      return {
        text,
        truncated: false,
        estimatedTokens,
        safeTokenLimit,
      };
    }

    const maxChars = Math.max(1, Math.floor(safeTokenLimit * config.charsPerToken));
    const truncatedText = `${text.slice(0, maxChars)}\n\n...[truncated for token safety]`;

    return {
      text: truncatedText,
      truncated: true,
      estimatedTokens,
      safeTokenLimit,
    };
  }

  async addTask(
    projectId: string,
    taskData: Omit<Task, "id" | "createdAt" | "updatedAt">
  ): Promise<Task> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const now = toLocalISOString();
    const task: Task = {
      ...taskData,
      channel: taskData.channel || "general",
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
    };

    project.tasks.push(task);
    await this.store.updateProject(project);

    return task;
  }

  async updateTask(
    projectId: string,
    taskId: string,
    updates: Partial<Task>
  ): Promise<Task> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const taskIndex = project.tasks.findIndex((task) => task.id === taskId);
    if (taskIndex === -1) {
      throw new Error("Task not found");
    }

    const updatedTask = {
      ...project.tasks[taskIndex],
      ...updates,
      updatedAt: toLocalISOString(),
    };

    if (updates.status === "completed" && !updatedTask.completedAt) {
      updatedTask.completedAt = toLocalISOString();
    }

    project.tasks[taskIndex] = updatedTask;
    await this.store.updateProject(project);

    return updatedTask;
  }

  async addNote(
    projectId: string,
    content: string,
    category?: string,
    channel?: string
  ): Promise<void> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    project.notes.push({
      id: uuidv4(),
      content,
      channel: channel || "general",
      category: category || "general",
      timestamp: toLocalISOString(),
    });

    await this.store.updateProject(project);
  }

  async recordDecision(
    projectId: string,
    decision: string,
    reasoning: string,
    impact?: string,
    channel?: string
  ): Promise<void> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    project.decisions.push({
      id: uuidv4(),
      decision,
      reasoning,
      channel: channel || "general",
      impact,
      timestamp: toLocalISOString(),
    });

    await this.store.updateProject(project);
  }

  async createCheckpoint(
    projectId: string,
    name: string,
    description?: string,
    includeSessions = true
  ): Promise<CheckpointContext> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const sessions = includeSessions
      ? await this.store.getProjectSessions(projectId)
      : [];

    return this.store.createCheckpoint({
      projectId,
      name,
      description,
      projectSnapshot: project,
      sessionSnapshots: sessions,
    });
  }

  async restoreCheckpoint(
    checkpointId: string,
    restoreSessions = true
  ): Promise<{ projectId: string; restoredSessions: number }> {
    const checkpoint = await this.store.getCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new Error("Checkpoint not found");
    }

    const restoredProject: ProjectContext = {
      ...checkpoint.projectSnapshot,
      lastAccessedAt: toLocalISOString(),
    };

    await this.store.updateProject(restoredProject);

    let restoredSessions = 0;
    if (restoreSessions) {
      for (const session of checkpoint.sessionSnapshots) {
        await this.store.upsertSession(session);
      }
      restoredSessions = checkpoint.sessionSnapshots.length;
    }

    return {
      projectId: checkpoint.projectId,
      restoredSessions,
    };
  }

  async cacheFile(filePath: string, content: string) {
    const hash = createHash("sha256").update(content).digest("hex");
    return this.store.upsertFileCache({
      filePath,
      hash,
      size: Buffer.byteLength(content, "utf8"),
      updatedAt: toLocalISOString(),
    });
  }

  async checkFileChanged(filePath: string, currentContent?: string) {
    const cached = await this.store.getFileCache(filePath);
    if (!cached) {
      return { cached: false, changed: true };
    }

    if (typeof currentContent !== "string") {
      return { cached: true, changed: false, hash: cached.hash };
    }

    const currentHash = createHash("sha256")
      .update(currentContent)
      .digest("hex");

    return {
      cached: true,
      changed: currentHash !== cached.hash,
      previousHash: cached.hash,
      currentHash,
    };
  }

  async deriveChannelFromGit(projectDir?: string): Promise<string> {
    if (!projectDir) {
      return "general";
    }

    try {
      const { stdout } = await execFileAsync("git", [
        "-C",
        projectDir,
        "rev-parse",
        "--abbrev-ref",
        "HEAD",
      ]);

      const branch = stdout.trim().toLowerCase();
      if (!branch || branch === "main" || branch === "master") {
        return "general";
      }

      const normalized = branch
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 24);

      return normalized || "general";
    } catch {
      return "general";
    }
  }
}
