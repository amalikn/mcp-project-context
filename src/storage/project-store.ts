import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  ProjectContext,
  SessionContext,
  CheckpointContext,
  FileCacheEntry,
  ProjectContextSchema,
  SessionContextSchema,
  CheckpointContextSchema,
  FileCacheEntrySchema,
} from "../types/project-types.js";
import { toLocalISOString } from "../utils/time.js";

export class ProjectStore {
  private dataDir: string;
  private projectsDir: string;
  private sessionsDir: string;
  private checkpointsDir: string;
  private fileCacheDir: string;

  constructor(dataDir = "./data") {
    this.dataDir = dataDir;
    this.projectsDir = path.join(dataDir, "projects");
    this.sessionsDir = path.join(dataDir, "sessions");
    this.checkpointsDir = path.join(dataDir, "checkpoints");
    this.fileCacheDir = path.join(dataDir, "file-cache");
    this.ensureDirectories();
  }

  getDataDir(): string {
    return this.dataDir;
  }

  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.projectsDir);
    await fs.ensureDir(this.sessionsDir);
    await fs.ensureDir(this.checkpointsDir);
    await fs.ensureDir(this.fileCacheDir);
  }

  private getFileCachePath(filePath: string): string {
    const safeFileName = Buffer.from(filePath).toString("base64url");
    return path.join(this.fileCacheDir, `${safeFileName}.json`);
  }

  async createProject(
    projectData: Omit<
      ProjectContext,
      "id" | "createdAt" | "updatedAt" | "lastAccessedAt"
    >
  ): Promise<ProjectContext> {
    const now = toLocalISOString();
    const project: ProjectContext = {
      ...projectData,
      id: uuidv4(),
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
    };

    const validated = ProjectContextSchema.parse(project);
    const filePath = path.join(this.projectsDir, `${project.id}.json`);
    await fs.writeJson(filePath, validated, { spaces: 2 });

    return validated;
  }

  async getProject(projectId: string): Promise<ProjectContext | null> {
    const filePath = path.join(this.projectsDir, `${projectId}.json`);

    if (!(await fs.pathExists(filePath))) {
      return null;
    }

    const data = await fs.readJson(filePath);
    const project = ProjectContextSchema.parse(data);

    // Update last accessed time
    project.lastAccessedAt = toLocalISOString();
    await this.updateProject(project);

    return project;
  }

  async updateProject(project: ProjectContext): Promise<ProjectContext> {
    project.updatedAt = toLocalISOString();
    const validated = ProjectContextSchema.parse(project);
    const filePath = path.join(this.projectsDir, `${project.id}.json`);
    await fs.writeJson(filePath, validated, { spaces: 2 });
    return validated;
  }

  async listProjects(): Promise<ProjectContext[]> {
    const files = await fs.readdir(this.projectsDir);
    const projects: ProjectContext[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const data = await fs.readJson(path.join(this.projectsDir, file));
        projects.push(ProjectContextSchema.parse(data));
      }
    }

    return projects.sort(
      (a, b) =>
        new Date(b.lastAccessedAt).getTime() -
        new Date(a.lastAccessedAt).getTime()
    );
  }

  async createSession(
    sessionData: Omit<SessionContext, "sessionId">
  ): Promise<SessionContext> {
    const session: SessionContext = {
      ...sessionData,
      sessionId: uuidv4(),
    };

    const validated = SessionContextSchema.parse(session);
    const filePath = path.join(this.sessionsDir, `${session.sessionId}.json`);
    await fs.writeJson(filePath, validated, { spaces: 2 });

    return validated;
  }

  async getProjectSessions(projectId: string): Promise<SessionContext[]> {
    const files = await fs.readdir(this.sessionsDir);
    const sessions: SessionContext[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const data = await fs.readJson(path.join(this.sessionsDir, file));
        const session = SessionContextSchema.parse(data);
        if (session.projectId === projectId) {
          sessions.push(session);
        }
      }
    }

    return sessions.sort(
      (a, b) =>
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }

  async getSession(sessionId: string): Promise<SessionContext | null> {
    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);

    if (!(await fs.pathExists(filePath))) {
      return null;
    }

    const data = await fs.readJson(filePath);
    return SessionContextSchema.parse(data);
  }

  async updateSession(
    sessionId: string,
    updates: Partial<SessionContext>
  ): Promise<SessionContext> {
    const currentSession = await this.getSession(sessionId);
    if (!currentSession) {
      throw new Error("Session not found");
    }

    const updatedSession = SessionContextSchema.parse({
      ...currentSession,
      ...updates,
      sessionId: currentSession.sessionId,
      projectId: currentSession.projectId,
    });

    const filePath = path.join(this.sessionsDir, `${sessionId}.json`);
    await fs.writeJson(filePath, updatedSession, { spaces: 2 });

    return updatedSession;
  }

  async upsertSession(session: SessionContext): Promise<SessionContext> {
    const validated = SessionContextSchema.parse(session);
    const filePath = path.join(this.sessionsDir, `${validated.sessionId}.json`);
    await fs.writeJson(filePath, validated, { spaces: 2 });
    return validated;
  }

  async createCheckpoint(
    checkpointData: Omit<CheckpointContext, "checkpointId" | "createdAt">
  ): Promise<CheckpointContext> {
    const checkpoint: CheckpointContext = {
      ...checkpointData,
      checkpointId: uuidv4(),
      createdAt: toLocalISOString(),
    };

    const validated = CheckpointContextSchema.parse(checkpoint);
    const filePath = path.join(
      this.checkpointsDir,
      `${validated.checkpointId}.json`
    );
    await fs.writeJson(filePath, validated, { spaces: 2 });

    return validated;
  }

  async getCheckpoint(checkpointId: string): Promise<CheckpointContext | null> {
    const filePath = path.join(this.checkpointsDir, `${checkpointId}.json`);

    if (!(await fs.pathExists(filePath))) {
      return null;
    }

    const data = await fs.readJson(filePath);
    return CheckpointContextSchema.parse(data);
  }

  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    const filePath = path.join(this.checkpointsDir, `${checkpointId}.json`);

    if (!(await fs.pathExists(filePath))) {
      return false;
    }

    await fs.remove(filePath);
    return true;
  }

  async listProjectCheckpoints(projectId: string): Promise<CheckpointContext[]> {
    const files = await fs.readdir(this.checkpointsDir);
    const checkpoints: CheckpointContext[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) {
        continue;
      }

      const data = await fs.readJson(path.join(this.checkpointsDir, file));
      const checkpoint = CheckpointContextSchema.parse(data);
      if (checkpoint.projectId === projectId) {
        checkpoints.push(checkpoint);
      }
    }

    return checkpoints.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async upsertFileCache(entry: FileCacheEntry): Promise<FileCacheEntry> {
    const validated = FileCacheEntrySchema.parse(entry);
    const filePath = this.getFileCachePath(validated.filePath);
    await fs.writeJson(filePath, validated, { spaces: 2 });
    return validated;
  }

  async getFileCache(filePath: string): Promise<FileCacheEntry | null> {
    const cachePath = this.getFileCachePath(filePath);

    if (!(await fs.pathExists(cachePath))) {
      return null;
    }

    const data = await fs.readJson(cachePath);
    return FileCacheEntrySchema.parse(data);
  }

  async listChannels(projectId: string): Promise<
    Array<{
      channel: string;
      taskCount: number;
      noteCount: number;
      decisionCount: number;
      sessionCount: number;
    }>
  > {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const sessions = await this.getProjectSessions(projectId);
    const channelMap = new Map<
      string,
      {
        channel: string;
        taskCount: number;
        noteCount: number;
        decisionCount: number;
        sessionCount: number;
      }
    >();

    const ensureChannel = (channelName?: string) => {
      const normalized = channelName || "general";
      if (!channelMap.has(normalized)) {
        channelMap.set(normalized, {
          channel: normalized,
          taskCount: 0,
          noteCount: 0,
          decisionCount: 0,
          sessionCount: 0,
        });
      }
      return channelMap.get(normalized)!;
    };

    for (const task of project.tasks) {
      ensureChannel(task.channel).taskCount += 1;
    }

    for (const note of project.notes) {
      ensureChannel(note.channel).noteCount += 1;
    }

    for (const decision of project.decisions) {
      ensureChannel(decision.channel).decisionCount += 1;
    }

    for (const session of sessions) {
      ensureChannel(session.channel).sessionCount += 1;
    }

    return [...channelMap.values()].sort((a, b) =>
      a.channel.localeCompare(b.channel)
    );
  }
}
