import { z } from "zod";

export const ProjectStatusSchema = z.enum([
  "planning",
  "in-progress",
  "blocked",
  "review",
  "completed",
  "archived",
]);

export const TaskStatusSchema = z.enum([
  "todo",
  "in-progress",
  "blocked",
  "completed",
]);

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: TaskStatusSchema,
  priority: z.enum(["low", "medium", "high", "critical"]),
  assignee: z.string().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
  blockers: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
});

export const ProjectContextSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  status: ProjectStatusSchema,
  techStack: z.object({
    frontend: z.array(z.string()).default([]),
    backend: z.array(z.string()).default([]),
    database: z.array(z.string()).default([]),
    infrastructure: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
  }),
  architecture: z.object({
    pattern: z.string().optional(),
    deploymentTarget: z.string().optional(),
    scalingStrategy: z.string().optional(),
    observability: z.array(z.string()).default([]),
  }),
  currentPhase: z.string(),
  nextSteps: z.array(z.string()).default([]),
  tasks: z.array(TaskSchema).default([]),
  decisions: z
    .array(
      z.object({
        id: z.string(),
        decision: z.string(),
        reasoning: z.string(),
        timestamp: z.string(),
        impact: z.string().optional(),
      })
    )
    .default([]),
  notes: z
    .array(
      z.object({
        id: z.string(),
        content: z.string(),
        timestamp: z.string(),
        category: z.string().optional(),
      })
    )
    .default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastAccessedAt: z.string(),
});

export const SessionContextSchema = z.object({
  sessionId: z.string(),
  projectId: z.string(),
  startTime: z.string(),
  endTime: z.string().optional(),
  goals: z.array(z.string()).default([]),
  achievements: z.array(z.string()).default([]),
  blockers: z.array(z.string()).default([]),
  nextSession: z.array(z.string()).default([]),
});

export type ProjectContext = z.infer<typeof ProjectContextSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type SessionContext = z.infer<typeof SessionContextSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
