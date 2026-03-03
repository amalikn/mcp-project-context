import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs-extra";
import path from "path";
import { z } from "zod";
import { ProjectStore } from "./storage/project-store.js";
import { ContextManager } from "./storage/context-manager.js";
import { toLocalISOString } from "./utils/time.js";

export class MCPProjectContextServer {
  private server: McpServer;
  private store: ProjectStore;
  private contextManager: ContextManager;
  private activeTools: Set<string>;
  private selectedToolProfile: string;

  private static readonly MUTATING_TOOLS = new Set<string>([
    "create_project",
    "add_task",
    "update_task",
    "add_note",
    "record_decision",
    "cache_file",
    "start_session",
    "end_session",
    "create_checkpoint",
    "restore_checkpoint",
    "restore_latest_checkpoint",
    "delete_checkpoint",
    "prepare_compaction",
  ]);

  constructor() {
    this.server = new McpServer({
      name: "project-context-server",
      version: "1.0.0",
    });

    this.store = new ProjectStore();
    this.contextManager = new ContextManager(this.store);
    const profileResolution = this.resolveToolProfile();
    this.selectedToolProfile = profileResolution.profile;
    this.activeTools = profileResolution.tools;
    this.setupTools();
  }

  private resolveToolProfile(): { profile: string; tools: Set<string> } {
    const allTools = [
      "tool_profile_status",
      "set_tool_profile",
      "tool_profile_snippets",
      "recovery_status",
      "recovery_resolve",
      "create_project",
      "get_project_context",
      "list_projects",
      "list_channels",
      "add_task",
      "update_task",
      "add_note",
      "record_decision",
      "cache_file",
      "file_changed",
      "start_session",
      "end_session",
      "create_checkpoint",
      "restore_checkpoint",
      "list_checkpoints",
      "restore_latest_checkpoint",
      "delete_checkpoint",
      "prepare_compaction",
    ] as const;

    const profiles: Record<string, string[]> = {
      minimal: [
        "tool_profile_status",
        "set_tool_profile",
        "tool_profile_snippets",
        "recovery_status",
        "recovery_resolve",
        "create_project",
        "get_project_context",
        "list_projects",
        "add_task",
        "update_task",
        "start_session",
        "end_session",
        "create_checkpoint",
        "restore_latest_checkpoint",
        "prepare_compaction",
      ],
      standard: [
        "tool_profile_status",
        "set_tool_profile",
        "tool_profile_snippets",
        "recovery_status",
        "recovery_resolve",
        "create_project",
        "get_project_context",
        "list_projects",
        "list_channels",
        "add_task",
        "update_task",
        "add_note",
        "record_decision",
        "cache_file",
        "file_changed",
        "start_session",
        "end_session",
        "create_checkpoint",
        "restore_checkpoint",
        "list_checkpoints",
        "restore_latest_checkpoint",
        "prepare_compaction",
      ],
      full: [...allTools],
    };

    const selectedProfile = (process.env.TOOL_PROFILE || "full").trim();
    const toolList = profiles[selectedProfile] || profiles.full;

    if (!profiles[selectedProfile]) {
      console.error(
        `Unknown TOOL_PROFILE "${selectedProfile}", falling back to "full"`
      );
    }

    return {
      profile: profiles[selectedProfile] ? selectedProfile : "full",
      tools: new Set(toolList),
    };
  }

  private registerTool(
    name: string,
    definition: any,
    handler: any
  ): void {
    if (!this.activeTools.has(name)) {
      return;
    }

    this.server.registerTool(name, definition, async (args: any) => {
      const isMutating = MCPProjectContextServer.MUTATING_TOOLS.has(name);
      let captureId: string | null = null;

      if (isMutating) {
        captureId = await this.beginRecoveryCapture(name, args || {});
      }

      try {
        const result = await handler(args);
        if (captureId) {
          await this.markRecoveryCaptureFlushed(captureId);
        }

        if (name !== "recovery_status" && name !== "recovery_resolve") {
          const pending = await this.listPendingRecoveryRecords();
          if (pending.length > 0 && Array.isArray(result?.content) && result.content.length > 0) {
            const first = result.content[0];
            if (first?.type === "text" && typeof first.text === "string") {
              first.text += `\n\nRecovery notice: ${pending.length} pending auto-capture item(s) detected from interrupted operations. Run recovery_status, then recovery_resolve(confirm=true, action=\"commit\"|\"discard\").`;
            }
          }
        }

        return result;
      } catch (error) {
        if (captureId) {
          await this.markRecoveryCapturePendingError(captureId, error);
        }
        throw error;
      }
    });
  }

  private getSafetyBlockMessage(
    action: string,
    target: string,
    force: boolean,
    safeMode?: boolean
  ): string | null {
    if (safeMode === undefined && !force) {
      return `${action} blocked for ${target}. Re-run with force=true to confirm.`;
    }

    if (safeMode === true && !force) {
      return `${action} blocked for ${target}. Re-run with force=true when safeMode is enabled.`;
    }

    return null;
  }

  private recoveryBaseDir(): string {
    return path.join(this.store.getDataDir(), "recovery");
  }

  private recoveryPendingDir(): string {
    return path.join(this.recoveryBaseDir(), "pending");
  }

  private recoveryResolvedDir(): string {
    return path.join(this.recoveryBaseDir(), "resolved");
  }

  private async ensureRecoveryDirs(): Promise<void> {
    await fs.ensureDir(this.recoveryPendingDir());
    await fs.ensureDir(this.recoveryResolvedDir());
  }

  private async listPendingRecoveryRecords(): Promise<any[]> {
    await this.ensureRecoveryDirs();
    const pendingDir = this.recoveryPendingDir();
    const files = (await fs.readdir(pendingDir))
      .filter((name) => name.endsWith(".json"))
      .sort();
    const records: any[] = [];
    for (const file of files) {
      try {
        const payload = await fs.readJson(path.join(pendingDir, file));
        records.push(payload);
      } catch {
        // ignore malformed recovery files
      }
    }
    return records;
  }

  private async beginRecoveryCapture(
    tool: string,
    args: unknown
  ): Promise<string> {
    await this.ensureRecoveryDirs();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      id,
      status: "pending",
      tool,
      args,
      createdAt: toLocalISOString(),
      updatedAt: toLocalISOString(),
      note: "Auto-captured before mutating operation.",
    };
    await fs.writeJson(path.join(this.recoveryPendingDir(), `${id}.json`), payload, {
      spaces: 2,
    });
    return id;
  }

  private async markRecoveryCaptureFlushed(captureId: string): Promise<void> {
    await this.ensureRecoveryDirs();
    const pendingFile = path.join(this.recoveryPendingDir(), `${captureId}.json`);
    if (!(await fs.pathExists(pendingFile))) {
      return;
    }
    const payload = await fs.readJson(pendingFile);
    payload.status = "flushed";
    payload.updatedAt = toLocalISOString();
    await fs.writeJson(
      path.join(this.recoveryResolvedDir(), `${captureId}.flushed.json`),
      payload,
      { spaces: 2 }
    );
    await fs.remove(pendingFile);
  }

  private async markRecoveryCapturePendingError(
    captureId: string,
    error: unknown
  ): Promise<void> {
    await this.ensureRecoveryDirs();
    const pendingFile = path.join(this.recoveryPendingDir(), `${captureId}.json`);
    if (!(await fs.pathExists(pendingFile))) {
      return;
    }
    const payload = await fs.readJson(pendingFile);
    payload.status = "pending_recovery";
    payload.updatedAt = toLocalISOString();
    payload.error = error instanceof Error ? error.message : String(error);
    payload.note =
      "Previous mutating operation may have been interrupted. Resolve via recovery_resolve.";
    await fs.writeJson(pendingFile, payload, { spaces: 2 });
  }

  private setupTools(): void {
    // Tool Profile Status
    this.registerTool(
      "tool_profile_status",
      {
        title: "Tool Profile Status",
        description: "Show active TOOL_PROFILE and enabled tools",
        inputSchema: {},
      },
      async () => {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  profile: this.selectedToolProfile,
                  enabledToolCount: this.activeTools.size,
                  enabledTools: [...this.activeTools].sort(),
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // Set Tool Profile (Guided)
    this.registerTool(
      "set_tool_profile",
      {
        title: "Set Tool Profile",
        description:
          "Get instructions to change TOOL_PROFILE in Claude MCP config (requires restart)",
        inputSchema: {
          profile: z
            .enum(["minimal", "standard", "full"])
            .describe("Desired tool profile"),
        },
      },
      async ({ profile }: any) => {
        const changed = profile !== this.selectedToolProfile;

        const instructions = [
          `Requested profile: ${profile}`,
          `Current profile: ${this.selectedToolProfile}`,
          "Update your MCP server env with:",
          `{ \"TOOL_PROFILE\": \"${profile}\" }`,
          "Then restart Claude Code / MCP session.",
        ].join("\n");

        return {
          content: [
            {
              type: "text",
              text: changed
                ? instructions
                : `Profile is already set to ${profile}. No config change needed.`,
            },
          ],
        };
      }
    );

    // Tool Profile Snippets
    this.registerTool(
      "tool_profile_snippets",
      {
        title: "Tool Profile Snippets",
        description:
          "Get paste-ready Claude MCP env snippets for minimal, standard, and full profiles",
        inputSchema: {},
      },
      async () => {
        const snippets = {
          minimal: {
            env: {
              TOOL_PROFILE: "minimal",
            },
          },
          standard: {
            env: {
              TOOL_PROFILE: "standard",
            },
          },
          full: {
            env: {
              TOOL_PROFILE: "full",
            },
          },
          note: "Set one of these under your mcp server env and restart Claude Code / MCP session.",
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(snippets, null, 2),
            },
          ],
        };
      }
    );

    this.registerTool(
      "recovery_status",
      {
        title: "Recovery Status",
        description: "List pending auto-capture items from interrupted operations",
        inputSchema: {},
      },
      async () => {
        const pending = await this.listPendingRecoveryRecords();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  pendingCount: pending.length,
                  pending,
                  guidance:
                    "Run recovery_resolve with confirm=true and action=commit|discard for a pendingId.",
                },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    this.registerTool(
      "recovery_resolve",
      {
        title: "Recovery Resolve",
        description:
          "Commit or discard a pending auto-capture item after reconnect",
        inputSchema: {
          pendingId: z.string().describe("Pending recovery capture ID"),
          action: z
            .enum(["commit", "discard"])
            .describe("Resolve action to take"),
          confirm: z
            .boolean()
            .default(false)
            .describe("Set true to confirm resolution"),
        },
      },
      async ({ pendingId, action, confirm }: any) => {
        if (!confirm) {
          return {
            content: [
              {
                type: "text",
                text: "Resolution blocked. Re-run with confirm=true.",
              },
            ],
          };
        }

        await this.ensureRecoveryDirs();
        const pendingFile = path.join(
          this.recoveryPendingDir(),
          `${pendingId}.json`
        );
        if (!(await fs.pathExists(pendingFile))) {
          return {
            content: [
              {
                type: "text",
                text: `Pending recovery item not found: ${pendingId}`,
              },
            ],
          };
        }

        const payload = await fs.readJson(pendingFile);
        payload.status = action === "commit" ? "committed" : "discarded";
        payload.resolvedAt = toLocalISOString();
        payload.resolutionAction = action;
        await fs.writeJson(
          path.join(this.recoveryResolvedDir(), `${pendingId}.${action}.json`),
          payload,
          { spaces: 2 }
        );
        await fs.remove(pendingFile);

        return {
          content: [
            {
              type: "text",
              text: `Recovery item ${pendingId} marked as ${payload.status}.`,
            },
          ],
        };
      }
    );

    // Create Project
    this.registerTool(
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
      async ({ name, description, techStack, currentPhase }: any) => {
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
    this.registerTool(
      "get_project_context",
      {
        title: "Get Project Context",
        description: "Get comprehensive project context and current state",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          section: z
            .enum(["all", "tasks", "notes", "decisions", "sessions"])
            .optional()
            .describe("Optional section filter"),
          channel: z
            .string()
            .optional()
            .describe("Optional channel filter"),
          category: z
            .string()
            .optional()
            .describe("Optional category filter (notes/decisions)"),
          taskStatus: z
            .enum(["todo", "in-progress", "blocked", "completed"])
            .optional()
            .describe("Optional task status filter"),
          taskPriority: z
            .enum(["low", "medium", "high", "critical"])
            .optional()
            .describe("Optional task priority filter"),
          createdAfter: z
            .string()
            .optional()
            .describe("ISO date filter: include entries created after"),
          createdBefore: z
            .string()
            .optional()
            .describe("ISO date filter: include entries created before"),
          sort: z
            .enum(["created_desc", "created_asc", "updated_desc", "updated_asc"])
            .optional()
            .describe("Sort order"),
          limit: z.number().int().positive().optional().describe("Page size"),
          offset: z
            .number()
            .int()
            .nonnegative()
            .optional()
            .describe("Pagination offset"),
          keyPattern: z
            .string()
            .optional()
            .describe("Optional regex for matching content"),
        },
      },
      async ({
        projectId,
        section,
        channel,
        category,
        taskStatus,
        taskPriority,
        createdAfter,
        createdBefore,
        sort,
        limit,
        offset,
        keyPattern,
      }: any) => {
        try {
          const context = await this.contextManager.getCurrentContext(projectId, {
            section,
            channel,
            category,
            taskStatus,
            taskPriority,
            createdAfter,
            createdBefore,
            sort,
            limit,
            offset,
            keyPattern,
          });
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
    this.registerTool(
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

    // List Channels
    this.registerTool(
      "list_channels",
      {
        title: "List Channels",
        description: "List channels with task/note/decision/session counts",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
        },
      },
      async ({ projectId }: any) => {
        try {
          const channels = await this.store.listChannels(projectId);
          const channelList = channels
            .map(
              (channel) =>
                `- ${channel.channel}: tasks=${channel.taskCount}, notes=${channel.noteCount}, decisions=${channel.decisionCount}, sessions=${channel.sessionCount}`
            )
            .join("\n");

          return {
            content: [
              {
                type: "text",
                text: `Channels:\n${channelList || "No channels found"}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error listing channels: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Add Task
    this.registerTool(
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
          channel: z
            .string()
            .optional()
            .describe("Task channel for grouped context"),
        },
      },
      async ({ projectId, title, description, priority, tags, channel }: any) => {
        try {
          const task = await this.contextManager.addTask(projectId, {
            title,
            description: description || "",
            status: "todo",
            priority,
            channel: channel || "general",
            tags: tags || [],
            blockers: [],
            dependencies: [],
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
    this.registerTool(
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
      async ({ projectId, taskId, status, title, description, priority }: any) => {
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
    this.registerTool(
      "add_note",
      {
        title: "Add Note",
        description: "Add a note to the project",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          content: z.string().describe("Note content"),
          category: z.string().optional().describe("Note category"),
          channel: z
            .string()
            .optional()
            .describe("Note channel for grouped context"),
        },
      },
      async ({ projectId, content, category, channel }: any) => {
        try {
          await this.contextManager.addNote(projectId, content, category, channel);
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
    this.registerTool(
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
          channel: z
            .string()
            .optional()
            .describe("Decision channel for grouped context"),
        },
      },
      async ({ projectId, decision, reasoning, impact, channel }: any) => {
        try {
          await this.contextManager.recordDecision(
            projectId,
            decision,
            reasoning,
            impact,
            channel
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

    // Cache File
    this.registerTool(
      "cache_file",
      {
        title: "Cache File",
        description: "Cache file content hash for change detection",
        inputSchema: {
          filePath: z.string().describe("File path"),
          content: z.string().describe("Current file content"),
        },
      },
      async ({ filePath, content }: any) => {
        try {
          const entry = await this.contextManager.cacheFile(filePath, content);
          return {
            content: [
              {
                type: "text",
                text: `File cached: ${entry.filePath} (hash: ${entry.hash.slice(
                  0,
                  12
                )}...)`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error caching file: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // File Changed
    this.registerTool(
      "file_changed",
      {
        title: "File Changed",
        description: "Check if file content changed from cached hash",
        inputSchema: {
          filePath: z.string().describe("File path"),
          currentContent: z
            .string()
            .optional()
            .describe("Optional current file content to compare"),
        },
      },
      async ({ filePath, currentContent }: any) => {
        try {
          const result = await this.contextManager.checkFileChanged(
            filePath,
            currentContent
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error checking file change: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Start Session
    this.registerTool(
      "start_session",
      {
        title: "Start Session",
        description: "Start a new development session",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          goals: z.array(z.string()).describe("Session goals"),
          channel: z
            .string()
            .optional()
            .describe("Optional session channel"),
          projectDir: z
            .string()
            .optional()
            .describe("Optional project path for git-based channel derivation"),
          deriveChannelFromGit: z
            .boolean()
            .default(false)
            .describe("Derive channel from git branch when projectDir is provided"),
        },
      },
      async ({ projectId, goals, channel, projectDir, deriveChannelFromGit }: any) => {
        try {
          const resolvedChannel = deriveChannelFromGit
            ? await this.contextManager.deriveChannelFromGit(projectDir)
            : channel || "general";

          const session = await this.store.createSession({
            projectId,
            channel: resolvedChannel,
            startTime: toLocalISOString(),
            goals,
            achievements: [],
            blockers: [],
            nextSession: [],
          });
          return {
            content: [
              {
                type: "text",
                text: `Session started with ID: ${session.sessionId} on channel: ${resolvedChannel}`,
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
    this.registerTool(
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
          safeMode: z
            .boolean()
            .default(false)
            .describe("If true, require force=true to end session"),
          force: z
            .boolean()
            .default(false)
            .describe("Set true to confirm ending session when safeMode is enabled"),
        },
      },
      async ({
        sessionId,
        achievements,
        blockers,
        nextSession,
        safeMode,
        force,
      }: any) => {
        try {
          const safetyMessage = this.getSafetyBlockMessage(
            "Ending session",
            sessionId,
            force,
            safeMode
          );

          if (safetyMessage) {
            return {
              content: [
                {
                  type: "text",
                  text: safetyMessage,
                },
              ],
            };
          }

          const updatedSession = await this.store.updateSession(sessionId, {
            endTime: toLocalISOString(),
            achievements,
            blockers,
            nextSession,
          });

          return {
            content: [
              {
                type: "text",
                text: `Session ${updatedSession.sessionId} ended successfully`,
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

    // Create Checkpoint
    this.registerTool(
      "create_checkpoint",
      {
        title: "Create Checkpoint",
        description: "Create a project checkpoint snapshot",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          name: z.string().describe("Checkpoint name"),
          description: z.string().optional().describe("Checkpoint description"),
          includeSessions: z
            .boolean()
            .default(true)
            .describe("Include project sessions in the checkpoint"),
        },
      },
      async ({ projectId, name, description, includeSessions }: any) => {
        try {
          const checkpoint = await this.contextManager.createCheckpoint(
            projectId,
            name,
            description,
            includeSessions
          );

          return {
            content: [
              {
                type: "text",
                text: `Checkpoint "${checkpoint.name}" created with ID: ${checkpoint.checkpointId}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error creating checkpoint: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Prepare Compaction
    this.registerTool(
      "prepare_compaction",
      {
        title: "Prepare Compaction",
        description:
          "Create a recovery checkpoint before compaction or long context cleanup",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          name: z
            .string()
            .optional()
            .describe("Optional checkpoint name"),
          includeSessions: z
            .boolean()
            .default(true)
            .describe("Include sessions in checkpoint snapshot"),
        },
      },
      async ({ projectId, name, includeSessions }: any) => {
        try {
          const checkpointName =
            name || `auto-compaction-${new Date().toISOString()}`;
          const checkpoint = await this.contextManager.createCheckpoint(
            projectId,
            checkpointName,
            "Automatic checkpoint created before compaction-style cleanup.",
            includeSessions
          );
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    ok: true,
                    checkpointId: checkpoint.checkpointId,
                    checkpointName: checkpoint.name,
                    guidance:
                      "Proceed with compaction/cleanup. If anything goes wrong, use restore_checkpoint.",
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error preparing compaction: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Restore Checkpoint
    this.registerTool(
      "restore_checkpoint",
      {
        title: "Restore Checkpoint",
        description: "Restore a project from a saved checkpoint",
        inputSchema: {
          checkpointId: z.string().describe("Checkpoint ID"),
          restoreSessions: z
            .boolean()
            .default(true)
            .describe("Restore sessions from checkpoint"),
          safeMode: z
            .boolean()
            .default(false)
            .describe("If true, require force=true to restore"),
          force: z
            .boolean()
            .default(false)
            .describe("Set true to confirm restore when safeMode is enabled"),
        },
      },
      async ({ checkpointId, restoreSessions, safeMode, force }: any) => {
        try {
          const safetyMessage = this.getSafetyBlockMessage(
            "Restore",
            `checkpoint ${checkpointId}`,
            force,
            safeMode
          );

          if (safetyMessage) {
            return {
              content: [
                {
                  type: "text",
                  text: safetyMessage,
                },
              ],
            };
          }

          const result = await this.contextManager.restoreCheckpoint(
            checkpointId,
            restoreSessions
          );

          return {
            content: [
              {
                type: "text",
                text: `Checkpoint restored for project ${result.projectId}. Restored sessions: ${result.restoredSessions}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error restoring checkpoint: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // List Checkpoints
    this.registerTool(
      "list_checkpoints",
      {
        title: "List Checkpoints",
        description: "List checkpoints for a project ordered by newest",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          limit: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Optional number of checkpoints to return"),
        },
      },
      async ({ projectId, limit }: any) => {
        try {
          const checkpoints = await this.store.listProjectCheckpoints(projectId);
          const capped = limit
            ? checkpoints.slice(0, Math.max(1, limit))
            : checkpoints;

          const checkpointList = capped
            .map(
              (checkpoint) =>
                `- ${checkpoint.name} (${checkpoint.checkpointId}) - ${new Date(
                  checkpoint.createdAt
                ).toLocaleString()}${
                  checkpoint.description
                    ? ` - ${checkpoint.description}`
                    : ""
                }`
            )
            .join("\n");

          return {
            content: [
              {
                type: "text",
                text: `Checkpoints:\n${checkpointList || "No checkpoints found"}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error listing checkpoints: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Restore Latest Checkpoint
    this.registerTool(
      "restore_latest_checkpoint",
      {
        title: "Restore Latest Checkpoint",
        description: "Restore the newest checkpoint for a project",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          restoreSessions: z
            .boolean()
            .default(true)
            .describe("Restore sessions from checkpoint"),
          safeMode: z
            .boolean()
            .default(false)
            .describe("If true, require force=true to restore"),
          force: z
            .boolean()
            .default(false)
            .describe("Set true to confirm restore when safeMode is enabled"),
        },
      },
      async ({ projectId, restoreSessions, safeMode, force }: any) => {
        try {
          const checkpoints = await this.store.listProjectCheckpoints(projectId);
          const latestCheckpoint = checkpoints[0];

          if (!latestCheckpoint) {
            return {
              content: [
                {
                  type: "text",
                  text: `No checkpoints found for project ${projectId}`,
                },
              ],
            };
          }

          const safetyMessage = this.getSafetyBlockMessage(
            "Restore",
            `latest checkpoint ${latestCheckpoint.checkpointId}`,
            force,
            safeMode
          );

          if (safetyMessage) {
            return {
              content: [
                {
                  type: "text",
                  text: safetyMessage,
                },
              ],
            };
          }

          const result = await this.contextManager.restoreCheckpoint(
            latestCheckpoint.checkpointId,
            restoreSessions
          );

          return {
            content: [
              {
                type: "text",
                text: `Restored latest checkpoint "${latestCheckpoint.name}" (${latestCheckpoint.checkpointId}) for project ${result.projectId}. Restored sessions: ${result.restoredSessions}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error restoring latest checkpoint: ${
                  error instanceof Error ? error.message : "Unknown error"
                }`,
              },
            ],
          };
        }
      }
    );

    // Delete Checkpoint
    this.registerTool(
      "delete_checkpoint",
      {
        title: "Delete Checkpoint",
        description: "Delete a checkpoint by ID",
        inputSchema: {
          checkpointId: z.string().describe("Checkpoint ID"),
          force: z
            .boolean()
            .default(false)
            .describe("Set true to confirm checkpoint deletion"),
        },
      },
      async ({ checkpointId, force }: any) => {
        try {
          const safetyMessage = this.getSafetyBlockMessage(
            "Deletion",
            `checkpoint ${checkpointId}`,
            force
          );

          if (safetyMessage) {
            return {
              content: [
                {
                  type: "text",
                  text: safetyMessage,
                },
              ],
            };
          }

          const deleted = await this.store.deleteCheckpoint(checkpointId);

          return {
            content: [
              {
                type: "text",
                text: deleted
                  ? `Checkpoint ${checkpointId} deleted successfully`
                  : `Checkpoint ${checkpointId} not found`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error deleting checkpoint: ${
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
    await this.server.connect(transport);
    console.error("MCP Project Context Server connected and listening");

    // Keep the process alive
    process.stdin.on("close", () => {
      console.error("Transport closed");
      process.exit(0);
    });
  }
}
