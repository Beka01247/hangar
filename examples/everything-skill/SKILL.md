---
name: everything
description: Sample Hangar skill that exposes the reference "everything" MCP server. Use it to try tool forms, echo messages and inspect what an MCP-backed skill looks like inside Hangar.
---

# Everything

This skill ships no logic of its own. It wires the reference `@modelcontextprotocol/server-everything` server into Hangar so its tools (`echo`, `add`, `get-env`, `long-running-operation`, …) show up as forms in the skill screen and as tools for the agent.

When asked to test something, prefer calling the MCP tools over doing the work yourself.
