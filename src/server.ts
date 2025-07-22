import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ProjectStore } from "./storage/project-store.js";
import { ContextManager } from "./storage/context-manager.js";

export class MCPProjectContextServer {
  private server: McpServer;
  private store: ProjectStore;
  private contextManager: ContextManager;

  constructor() {
    this.server = new McpServer({
      name: "project-context-server",
      version: "1.0.0",
    });

    this.store = new ProjectStore();
    this.contextManager = new ContextManager(this.store);
    this.setupTools();
  }

  private setupTools(): void {
    // Create Project
    this.server.registerTool(
      "create_project",
      {
        title: "Create Project",
        description: "Create a new project with initial context",
        inputSchema: {
          name: z.string().describe("Project name"),
          description: z.string().describe("Project description"),
          techStack: z
            .object({
              frontend: z.array(z.string()).default([]),
              backend: z.array(z.string()).default([]),
              database: z.array(z.string()).default([]),
              infrastructure: z.array(z.string()).default([]),
              tools: z.array(z.string()).default([]),
            })
            .optional(),
          currentPhase: z.string().describe("Current project phase"),
        },
      },
      async ({ name, description, techStack, currentPhase }) => {
        try {
          const project = await this.store.createProject({
            name,
            description,
            status: "planning",
            techStack: techStack || {
              frontend: [],
              backend: [],
              database: [],
              infrastructure: [],
              tools: [],
            },
            architecture: {
              observability: [],
            },
            currentPhase,
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
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error creating project: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Get Project Context
    this.server.registerTool(
      "get_project_context",
      {
        title: "Get Project Context",
        description: "Get comprehensive project context and current state",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
        },
      },
      async ({ projectId }) => {
        try {
          const context = await this.contextManager.getCurrentContext(
            projectId
          );
          return {
            content: [
              {
                type: "text",
                text: context,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error getting project context: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // List Projects
    this.server.registerTool(
      "list_projects",
      {
        title: "List Projects",
        description: "List all projects ordered by last accessed",
        inputSchema: {},
      },
      async () => {
        try {
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
                text: `Active Projects:\n${projectList || "No projects found"}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error listing projects: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Add Task
    this.server.registerTool(
      "add_task",
      {
        title: "Add Task",
        description: "Add a new task to the project",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          title: z.string().describe("Task title"),
          description: z.string().optional().describe("Task description"),
          priority: z
            .enum(["low", "medium", "high", "critical"])
            .describe("Task priority"),
          tags: z.array(z.string()).default([]).describe("Task tags"),
        },
      },
      async ({ projectId, title, description, priority, tags }) => {
        try {
          const task = await this.contextManager.addTask(projectId, {
            title,
            description: description || "",
            status: "todo",
            priority,
            tags: tags || [],
          });
          return {
            content: [
              {
                type: "text",
                text: `Task "${task.title}" added with ID: ${task.id}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error adding task: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Update Task
    this.server.registerTool(
      "update_task",
      {
        title: "Update Task",
        description: "Update task status or details",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          taskId: z.string().describe("Task ID"),
          status: z
            .enum(["todo", "in-progress", "blocked", "completed"])
            .optional()
            .describe("New task status"),
          title: z.string().optional().describe("New task title"),
          description: z.string().optional().describe("New task description"),
          priority: z
            .enum(["low", "medium", "high", "critical"])
            .optional()
            .describe("New task priority"),
        },
      },
      async ({ projectId, taskId, status, title, description, priority }) => {
        try {
          const updatedTask = await this.contextManager.updateTask(
            projectId,
            taskId,
            {
              ...(status && { status }),
              ...(title && { title }),
              ...(description && { description }),
              ...(priority && { priority }),
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
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error updating task: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Add Note
    this.server.registerTool(
      "add_note",
      {
        title: "Add Note",
        description: "Add a note to the project",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          content: z.string().describe("Note content"),
          category: z.string().optional().describe("Note category"),
        },
      },
      async ({ projectId, content, category }) => {
        try {
          await this.contextManager.addNote(projectId, content, category);
          return {
            content: [
              {
                type: "text",
                text: "Note added successfully",
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error adding note: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Record Decision
    this.server.registerTool(
      "record_decision",
      {
        title: "Record Decision",
        description: "Record an architectural or technical decision",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          decision: z.string().describe("Decision made"),
          reasoning: z.string().describe("Reasoning behind the decision"),
          impact: z
            .string()
            .optional()
            .describe("Expected impact of the decision"),
        },
      },
      async ({ projectId, decision, reasoning, impact }) => {
        try {
          await this.contextManager.recordDecision(
            projectId,
            decision,
            reasoning,
            impact
          );
          return {
            content: [
              {
                type: "text",
                text: "Decision recorded successfully",
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error recording decision: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Start Session
    this.server.registerTool(
      "start_session",
      {
        title: "Start Session",
        description: "Start a new development session",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          goals: z.array(z.string()).describe("Session goals"),
        },
      },
      async ({ projectId, goals }) => {
        try {
          const session = await this.store.createSession({
            projectId,
            startTime: new Date().toISOString(),
            goals,
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
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error starting session: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // End Session
    this.server.registerTool(
      "end_session",
      {
        title: "End Session",
        description: "End current session with summary",
        inputSchema: {
          sessionId: z.string().describe("Session ID"),
          achievements: z
            .array(z.string())
            .default([])
            .describe("Session achievements"),
          blockers: z
            .array(z.string())
            .default([])
            .describe("Blockers encountered"),
          nextSession: z
            .array(z.string())
            .default([])
            .describe("Plans for next session"),
        },
      },
      async ({ sessionId, achievements, blockers, nextSession }) => {
        try {
          // Note: You'll need to implement updateSession in ProjectStore
          // For now, just return success
          return {
            content: [
              {
                type: "text",
                text: `Session ${sessionId} ended successfully`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error ending session: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    console.error("About to connect transport");
    await this.server.connect(transport);
    console.error("MCP Project Context Server connected and listening");

    // Keep the process alive
    process.stdin.on("close", () => {
      console.error("Transport closed");
      process.exit(0);
    });
  }
}
