import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ProjectStore } from "./storage/project-store.js";
import { ContextManager } from "./storage/context-manager.js";
import { z } from "zod";

export class MCPProjectContextServer {
  private server: Server;
  private store: ProjectStore;
  private contextManager: ContextManager;

  constructor() {
    this.server = new Server(
      {
        name: "project-context-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.store = new ProjectStore();
    this.contextManager = new ContextManager(this.store);
    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "create_project",
          description: "Create a new project with initial context",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Project name" },
              description: {
                type: "string",
                description: "Project description",
              },
              techStack: {
                type: "object",
                properties: {
                  frontend: { type: "array", items: { type: "string" } },
                  backend: { type: "array", items: { type: "string" } },
                  database: { type: "array", items: { type: "string" } },
                  infrastructure: { type: "array", items: { type: "string" } },
                  tools: { type: "array", items: { type: "string" } },
                },
              },
              currentPhase: {
                type: "string",
                description: "Current project phase",
              },
            },
            required: ["name", "description", "currentPhase"],
          },
        },
        {
          name: "get_project_context",
          description: "Get comprehensive project context and current state",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string", description: "Project ID" },
            },
            required: ["projectId"],
          },
        },
        {
          name: "list_projects",
          description: "List all projects ordered by last accessed",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "add_task",
          description: "Add a new task to the project",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              title: { type: "string" },
              description: { type: "string" },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
              },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["projectId", "title", "priority"],
          },
        },
        {
          name: "update_task",
          description: "Update task status or details",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              taskId: { type: "string" },
              status: {
                type: "string",
                enum: ["todo", "in-progress", "blocked", "completed"],
              },
              title: { type: "string" },
              description: { type: "string" },
              priority: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
              },
            },
            required: ["projectId", "taskId"],
          },
        },
        {
          name: "add_note",
          description: "Add a note to the project",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              content: { type: "string" },
              category: { type: "string" },
            },
            required: ["projectId", "content"],
          },
        },
        {
          name: "record_decision",
          description: "Record an architectural or technical decision",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              decision: { type: "string" },
              reasoning: { type: "string" },
              impact: { type: "string" },
            },
            required: ["projectId", "decision", "reasoning"],
          },
        },
        {
          name: "start_session",
          description: "Start a new development session",
          inputSchema: {
            type: "object",
            properties: {
              projectId: { type: "string" },
              goals: { type: "array", items: { type: "string" } },
            },
            required: ["projectId", "goals"],
          },
        },
        {
          name: "end_session",
          description: "End current session with summary",
          inputSchema: {
            type: "object",
            properties: {
              sessionId: { type: "string" },
              achievements: { type: "array", items: { type: "string" } },
              blockers: { type: "array", items: { type: "string" } },
              nextSession: { type: "array", items: { type: "string" } },
            },
            required: ["sessionId"],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "create_project":
            const project = await this.store.createProject({
              name: args.name,
              description: args.description,
              status: "planning",
              techStack: args.techStack || {
                frontend: [],
                backend: [],
                database: [],
                infrastructure: [],
                tools: [],
              },
              architecture: {
                observability: [],
              },
              currentPhase: args.currentPhase,
              nextSteps: [],
              tasks: [],
              decisions: [],
              notes: [],
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Project "${project.name}" created with ID: ${project.id}`,
                },
              ],
            };

          case "get_project_context":
            const context = await this.contextManager.getCurrentContext(
              args.projectId
            );
            return {
              content: [
                {
                  type: "text",
                  text: context,
                },
              ],
            };

          case "list_projects":
            const projects = await this.store.listProjects();
            const projectList = projects
              .map(
                (p) =>
                  `- ${p.name} (${p.id}) - ${
                    p.status
                  } - Last accessed: ${new Date(
                    p.lastAccessedAt
                  ).toLocaleDateString()}`
              )
              .join("\n");
            return {
              content: [
                {
                  type: "text",
                  text: `Active Projects:\n${
                    projectList || "No projects found"
                  }`,
                },
              ],
            };

          case "add_task":
            const task = await this.contextManager.addTask(args.projectId, {
              title: args.title,
              description: args.description || "",
              status: "todo",
              priority: args.priority,
              tags: args.tags || [],
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Task "${task.title}" added with ID: ${task.id}`,
                },
              ],
            };

          case "update_task":
            const updatedTask = await this.contextManager.updateTask(
              args.projectId,
              args.taskId,
              {
                ...(args.status && { status: args.status }),
                ...(args.title && { title: args.title }),
                ...(args.description && { description: args.description }),
                ...(args.priority && { priority: args.priority }),
              }
            );
            return {
              content: [
                {
                  type: "text",
                  text: `Task "${updatedTask.title}" updated successfully`,
                },
              ],
            };

          case "add_note":
            await this.contextManager.addNote(
              args.projectId,
              args.content,
              args.category
            );
            return {
              content: [
                {
                  type: "text",
                  text: "Note added successfully",
                },
              ],
            };

          case "record_decision":
            await this.contextManager.recordDecision(
              args.projectId,
              args.decision,
              args.reasoning,
              args.impact
            );
            return {
              content: [
                {
                  type: "text",
                  text: "Decision recorded successfully",
                },
              ],
            };

          case "start_session":
            const session = await this.store.createSession({
              projectId: args.projectId,
              startTime: new Date().toISOString(),
              goals: args.goals,
              achievements: [],
              blockers: [],
              nextSession: [],
            });
            return {
              content: [
                {
                  type: "text",
                  text: `Session started with ID: ${session.sessionId}`,
                },
              ],
            };

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run(): Promise<void> {
    const transport = this.server.connect();
    await this.server.run();
  }
}
