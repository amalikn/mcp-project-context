import fs from "fs-extra";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import {
  ProjectContext,
  SessionContext,
  ProjectContextSchema,
  SessionContextSchema,
} from "../types/project-types.js";

export class ProjectStore {
  private dataDir: string;
  private projectsDir: string;
  private sessionsDir: string;

  constructor(dataDir = "./data") {
    this.dataDir = dataDir;
    this.projectsDir = path.join(dataDir, "projects");
    this.sessionsDir = path.join(dataDir, "sessions");
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.projectsDir);
    await fs.ensureDir(this.sessionsDir);
  }

  async createProject(
    projectData: Omit<
      ProjectContext,
      "id" | "createdAt" | "updatedAt" | "lastAccessedAt"
    >
  ): Promise<ProjectContext> {
    const now = new Date().toISOString();
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
    project.lastAccessedAt = new Date().toISOString();
    await this.updateProject(project);

    return project;
  }

  async updateProject(project: ProjectContext): Promise<ProjectContext> {
    project.updatedAt = new Date().toISOString();
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
}
