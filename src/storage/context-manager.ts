import { ProjectStore } from "./project-store.js";
import {
  ProjectContext,
  Task,
  SessionContext,
} from "../types/project-types.js";
import { v4 as uuidv4 } from "uuid";

export class ContextManager {
  constructor(private store: ProjectStore) {}

  async getCurrentContext(projectId: string): Promise<string> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      return "Project not found";
    }

    const recentSessions = await this.store.getProjectSessions(projectId);
    const lastSession = recentSessions[0];

    return `
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

## Active Tasks (${
      project.tasks.filter((t) => t.status !== "completed").length
    }):
${
  project.tasks
    .filter((t) => t.status !== "completed")
    .map(
      (t) =>
        `- [${t.status.toUpperCase()}] ${t.title} (Priority: ${t.priority})`
    )
    .join("\n") || "No active tasks"
}

## Next Steps:
${
  project.nextSteps.map((step) => `- ${step}`).join("\n") ||
  "No next steps defined"
}

## Last Session Summary:
${
  lastSession
    ? `
- Goals: ${lastSession.goals.join(", ")}
- Achievements: ${lastSession.achievements.join(", ")}
- Blockers: ${lastSession.blockers.join(", ")}
- Next Session Plan: ${lastSession.nextSession.join(", ")}
`
    : "No previous sessions"
}

## Recent Decisions:
${
  project.decisions
    .slice(0, 3)
    .map(
      (d) => `- ${d.decision} (${new Date(d.timestamp).toLocaleDateString()})`
    )
    .join("\n") || "No recent decisions"
}
`.trim();
  }

  async addTask(
    projectId: string,
    taskData: Omit<Task, "id" | "createdAt" | "updatedAt">
  ): Promise<Task> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    const now = new Date().toISOString();
    const task: Task = {
      ...taskData,
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

    const taskIndex = project.tasks.findIndex((t) => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error("Task not found");
    }

    const updatedTask = {
      ...project.tasks[taskIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (updates.status === "completed" && !updatedTask.completedAt) {
      updatedTask.completedAt = new Date().toISOString();
    }

    project.tasks[taskIndex] = updatedTask;
    await this.store.updateProject(project);

    return updatedTask;
  }

  async addNote(
    projectId: string,
    content: string,
    category?: string
  ): Promise<void> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    project.notes.push({
      id: uuidv4(),
      content,
      category: category || "general",
      timestamp: new Date().toISOString(),
    });

    await this.store.updateProject(project);
  }

  async recordDecision(
    projectId: string,
    decision: string,
    reasoning: string,
    impact?: string
  ): Promise<void> {
    const project = await this.store.getProject(projectId);
    if (!project) {
      throw new Error("Project not found");
    }

    project.decisions.push({
      id: uuidv4(),
      decision,
      reasoning,
      impact,
      timestamp: new Date().toISOString(),
    });

    await this.store.updateProject(project);
  }
}
