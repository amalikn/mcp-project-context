import { MCPProjectContextServer } from "./server.js";

async function main() {
  try {
    const server = new MCPProjectContextServer();
    await server.run();
  } catch (error) {
    console.error("Server error:", error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
