# MCP Project Context Smoke Checklist

Use these quick commands/prompts in Claude to validate server capabilities.

## 1) Connectivity

```bash
claude mcp list
```

## 2) Profile Introspection

1. `tool_profile_status`
2. `tool_profile_snippets`
3. `set_tool_profile` with `profile: "standard"` (optional)

## 3) Project + Session + Channels

1. `create_project` (save returned `projectId`)
2. `start_session` with:
   - `projectId`
   - `goals`
   - `channel: "auth"` (or `deriveChannelFromGit: true` + `projectDir`)
3. `add_task` with `channel: "auth"`
4. `add_note` with `channel: "auth"`
5. `record_decision` with `channel: "auth"`
6. `list_channels` with `projectId`

## 4) Checkpoints + Safety

1. `create_checkpoint` with `projectId` and `name`
2. `list_checkpoints` with `projectId`
3. `restore_latest_checkpoint` with `safeMode: true` (no `force`) -> expect blocked
4. `restore_latest_checkpoint` with `safeMode: true, force: true` -> expect restore
5. `delete_checkpoint` with `force: false` -> expect blocked
6. `delete_checkpoint` with `force: true` -> expect deleted

## 5) File Cache

1. `cache_file` with `filePath` and `content`
2. `file_changed` with same `currentContent` -> expect `changed: false`
3. `file_changed` with modified `currentContent` -> expect `changed: true`

## 6) Context Filters + Token Safety

1. `get_project_context` with filters (example: `section`, `channel`, `limit`, `sort`)
2. For large data sets, confirm output includes `## Response Notice` (token truncation)

