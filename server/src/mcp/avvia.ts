// `bun run --cwd server mcp`: il server MCP «video» su stdio. Su stdout passa solo il protocollo; i messaggi vanno su stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { opzioniMcp } from "./opzioni"
import { creaServerMcp } from "./strumenti"

await creaServerMcp(opzioniMcp()).connect(new StdioServerTransport())
console.error("Mango Animation: strumenti MCP pronti.")
