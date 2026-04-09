---
title: "SQLite Explorer"
description: "A lightweight, dependency-free SQLite database browser that runs entirely in the browser via WebAssembly. Drag and drop a .db file to start querying — no server, no uploads."
status: "completed"
techStack: ["TypeScript", "WebAssembly", "SQLite", "Vite"]
repoUrl: "https://github.com/yourname/sqlite-explorer"
liveUrl: "https://sqlite.yourname.dev"
startDate: 2023-03-15
featured: false
---

## Overview

SQLite Explorer is a browser-based database viewer powered by [sql.js](https://sql.js.org/) (SQLite compiled to WebAssembly). You drag a `.db` file into the browser window — nothing is uploaded anywhere — and get a table browser, a query editor with syntax highlighting, and a schema inspector.

It started as a scratch tool for my own use. I had a SQLite database from a side project and didn't want to install DB Browser for SQLite just to run a few queries.

## Features

- **Drag-and-drop file loading** — no upload, everything stays in your browser
- **Table browser** — list all tables, view row counts, browse rows with pagination
- **SQL query editor** — with syntax highlighting and keyboard shortcuts
- **Schema inspector** — view `CREATE TABLE` statements, indexes, and triggers
- **Export** — download query results as CSV or JSON
- **No tracking, no server** — 100% client-side

## Architecture

The entire app is a single HTML file (after the Vite build). sql.js loads the SQLite WASM binary, which the browser caches after the first visit.

```
User drops .db file
       │
       ▼
FileReader API reads bytes
       │
       ▼
sql.js opens database from Uint8Array
       │
       ▼
App queries sqlite_master for schema
       │
       ▼
Renders table list, user can query
```

State management is intentionally minimal — just a single `db` reference and a reactive render function. No framework, no virtual DOM. The DOM update cost for a SQL query result is negligible.

## What I'd do differently

I'd use [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) (Origin Private File System) to allow persisting and modifying databases, not just reading them. The read-only constraint was fine for my use case but limits the tool significantly.

I'd also add a proper query history with local storage persistence. Right now each session starts fresh.

## Status

The core feature set is stable and I use it regularly. I'm not actively developing new features, but it works well for what it does.
