---
title: "130 Tokens/Second... Zero Bytes to the Cloud"
description: "OpenCode + Ollama on an RTX 5070 Ti, shared between WSL2 and a headless home server."
pubDate: 2026-10-10
updatedDate: 2026-10-15
tags: ["ai", "llm", "ollama", "wsl", "linux", "workflow"]
draft: false
---

**OpenCode + Ollama on an RTX 5070 Ti, shared between WSL2 and a home server**

I wanted an agent that handles the boring work (cloning repos, `gh`, setting up environments, installing dependencies, running commands) without sending anything to the cloud. Besides I need to squeeze the whole juice from that card. This is the full setup, step by step, including everything that went wrong.

- **Part 1** runs the agent locally in WSL2 on my Windows gaming PC.
- **Part 2** runs the agent on my headless Debian server (**deimos**), while the model still runs on the PC's GPU over the LAN.

> **About the values in this guide:** hostnames, IPs and usernames are examples. Replace them with your own:
>
> | Placeholder | Meaning |
> |---|---|
> | `gpu-pc` | The Windows PC with the GPU |
> | `deimos` | The headless Linux server |
> | `192.168.1.10` | The PC's LAN IP |
> | `192.168.1.20` | The server's LAN IP |
> | `your-github-user` | Your GitHub username |

---

## TL;DR: daily use

```bash
# On the PC (WSL) or on the server — same experience
cd ~/some/project && opencode
```

| Need | Do |
|---|---|
| Switch model | `/models` → **gpt-oss 20b** (fast) or **Devstral Small 2** (careful) |
| Agent stops mid-task with an empty reply | Type `continue` |
| Trusted, low-risk task | `opencode --auto` (auto-approves everything except `deny` rules) |
| Before pushing anything | `git status`, `git diff`, `git log -1`. **Never trust the agent's summary.** |
| Is the GPU doing the work? | `ollama ps` in WSL → `100% GPU` |
| Agent on the server hangs | The PC is probably asleep. Wake it up. |

---

## Architecture

```
┌───────────────────────── gpu-pc (Windows 11) ──────────────────────────────┐
│                                                                            │
│  Windows Ollama  127.0.0.1:11434   (kept for other apps)                   │
│                                                                            │
│  WSL2 (mirrored networking)                                                │
│   ├─ Ollama (systemd)  0.0.0.0:11435  ──►  RTX 5070 Ti (16GB)              │
│   └─ OpenCode  ──► http://127.0.0.1:11435/v1                               │
│                                                                            │
│  Windows Firewall + Hyper-V firewall: 11435 allowed ONLY from the server   │
└────────────────────────────────────▲───────────────────────────────────────┘
                                     │  LAN 192.168.1.0/24
                                     │  http://gpu-pc.local:11435/v1
┌────────────────────────────────────┴───────────────────────────────────────┐
│  deimos (Debian, headless) 192.168.1.20                                    │
│   └─ OpenCode (in tmux) — works on the server's files, docker, k3s         │
└────────────────────────────────────────────────────────────────────────────┘
```

| Component | Host | Address | Notes |
|---|---|---|---|
| GPU | PC | — | RTX 5070 Ti, ~14.5GB usable (Windows desktop uses ~1.6GB) |
| WSL Ollama | PC / WSL | `0.0.0.0:11435` | The agent's model server; 64K context |
| Windows Ollama | PC / Windows | `127.0.0.1:11434` | Separate install, left untouched |
| OpenCode (local) | PC / WSL | → `127.0.0.1:11435` | `~/.config/opencode/` |
| OpenCode (remote) | deimos | → `gpu-pc.local:11435` | `~/.config/opencode/` |
| PC LAN IP | — | `192.168.1.10` | Reserve in the router (DHCP) |
| Server LAN IP | — | `192.168.1.20` | Reserve in the router; the firewall rules depend on it |

> ⚠️ **Both Ollama instances share the same 16GB of VRAM.** Only keep a model loaded in one of them at a time. Check with `ollama ps` in WSL and the Windows tray app. Unload with `ollama stop <model>`.

---

## Choosing a harness and a model

**Harness: OpenCode.** It's an open source terminal agent (MIT licensed) that runs shell commands, edits files and calls `gh`. It works with any OpenAI-compatible endpoint, including Ollama, and has a fine-grained permission system. Alternatives I considered: Cline (a VS Code extension), Goose (MCP-first), and Aider (git-focused code editing).

**Models that fit in 16GB of VRAM:**

| Model | Speed | VRAM @ 64K | Use for |
|---|---|---|---|
| `gpt-oss:20b` (default) | ~130 tok/s | 12GB, 100% GPU | Mechanical chores: clone, install, scaffold, run commands |
| `devstral-small-2` | ~22 tok/s | 15GB, partly on CPU | Tasks that need reading and understanding code |

What I observed with each:

- **gpt-oss:20b** is fast, but sometimes it stops mid-task, claims work it didn't do, or writes placeholder content.
- **Devstral Small 2** wrote an accurate repo summary using the proper tools, but was about 3x slower overall.
- **Neither model reliably verifies its own work**, even when the rules tell it to. Always check.

---

## Part 1: Agent on the PC (WSL2)

### Step 1: Verify the GPU inside WSL

```bash
nvidia-smi
```

✅ The output should show your GPU, in my case an RTX 5070 Ti with about 16GB.

If it doesn't, update the NVIDIA driver **on Windows**, run `wsl --shutdown`, and reopen WSL. **Never install a Linux NVIDIA driver inside WSL.**

### Step 2: Check resources (optional: give WSL more RAM)

```bash
free -h && nproc && df -h ~
```

WSL defaults to half of system RAM. To raise it, edit `C:\Users\<you>\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
memory=24GB
swap=8GB
```

Then run `wsl --shutdown` in PowerShell and reopen WSL. The `networkingMode=mirrored` line is required for Part 2.

### Step 3: Install Ollama in WSL

```bash
sudo apt-get update && sudo apt-get install -y zstd   # the installer needs zstd
curl -fsSL https://ollama.com/install.sh | sh
```

### Step 4: Move WSL Ollama off port 11434

If Ollama for Windows is also installed, it owns `11434`, and with mirrored networking the WSL service crash-loops with `bind: address already in use`. The fix is to give the WSL instance its own port, plus tune it for agent work.

`/etc/systemd/system/ollama.service.d/override.conf`:

```bash
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf >/dev/null <<'EOF'
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11435"
Environment="OLLAMA_CONTEXT_LENGTH=65536"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
EOF
sudo systemctl daemon-reload && sudo systemctl restart ollama

# make the WSL `ollama` CLI talk to this instance, not the Windows one
echo 'export OLLAMA_HOST=127.0.0.1:11435' >> ~/.bashrc && source ~/.bashrc
```

| Setting | Why |
|---|---|
| `OLLAMA_HOST=0.0.0.0:11435` | Own port, and listens on the LAN for the server. Use `127.0.0.1:11435` if you only want Part 1. |
| `OLLAMA_CONTEXT_LENGTH=65536` | Agents need a large context, and OpenCode requires 64K or more. 128K spilled onto the CPU. |
| `OLLAMA_FLASH_ATTENTION=1` | Faster attention that uses less memory |
| `OLLAMA_KV_CACHE_TYPE=q8_0` | Roughly halves context memory with negligible quality loss |

✅ Verify:

```bash
systemctl status ollama --no-pager | head -5   # active (running), Drop-In: override.conf
ss -ltn | grep 11435                            # *:11435
curl http://localhost:11435                     # Ollama is running
curl http://localhost:11434                     # Ollama is running (the Windows one)
```

### Step 5: Pull and benchmark the models

```bash
ollama pull gpt-oss:20b
ollama pull devstral-small-2

ollama run gpt-oss:20b "write a bash one-liner that lists the 5 largest files in the current dir" --verbose
ollama ps
```

✅ Look for an `eval rate` above about 20 tok/s, and `PROCESSOR` showing `100% GPU`.

The first run is slow (about 60s to load, and the prompt eval can show only around 3 tok/s). That's disk loading plus CUDA warm-up. Run it again before judging.

**Finding the largest context that still fits:**

| Context | `ollama ps` | Verdict |
|---|---|---|
| 32K | 12GB, 100% GPU | ✅ |
| 64K | 12GB, 100% GPU | ✅ **chosen** |
| 128K | 14GB, 10%/90% CPU/GPU | ❌ spills to CPU |

gpt-oss barely grows between 32K and 64K, because half its layers only attend to a short sliding window of recent tokens.

### Step 6: GitHub CLI

```bash
type gh || sudo apt-get install -y gh
gh auth login           # GitHub.com → SSH → login with browser
gh auth status          # scopes should include repo, read:org
ssh -T git@github.com   # "Hi your-github-user! You've successfully authenticated"
```

Accepting GitHub's host key here, before the agent runs, means the agent's first `git clone` won't stop at a yes/no prompt. GitHub's ED25519 fingerprint is `SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU`.

### Step 7: Install OpenCode

```bash
curl -fsSL https://opencode.ai/install | bash
source ~/.bashrc
opencode --version
```

### Step 8: OpenCode config (provider + permissions)

`~/.config/opencode/opencode.json`:

```bash
mkdir -p ~/.config/opencode
cat > ~/.config/opencode/opencode.json <<'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "model": "ollama/gpt-oss:20b",
  "small_model": "ollama/gpt-oss:20b",
  "share": "disabled",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (WSL)",
      "options": { "baseURL": "http://127.0.0.1:11435/v1" },
      "models": {
        "gpt-oss:20b": {
          "name": "gpt-oss 20b (local)",
          "limit": { "context": 65536, "output": 16384 }
        },
        "devstral-small-2": {
          "name": "Devstral Small 2 (local)",
          "limit": { "context": 65536, "output": 16384 }
        }
      }
    }
  },
  "permission": {
    "edit": "allow",
    "external_directory": "ask",
    "doom_loop": "ask",
    "webfetch": "ask",
    "bash": {
      "*": "ask",

      "ls*": "allow", "pwd": "allow", "cat *": "allow", "head *": "allow",
      "tail *": "allow", "wc *": "allow", "grep *": "allow", "find *": "allow",
      "which *": "allow", "type *": "allow", "echo *": "allow", "tree*": "allow",

      "git status*": "allow", "git log*": "allow", "git diff*": "allow",
      "git branch*": "allow", "git remote*": "allow", "git fetch*": "allow",
      "git pull*": "allow", "git clone *": "allow", "git checkout *": "allow",
      "git switch *": "allow", "git add *": "allow", "git stash*": "allow",
      "git --version": "allow",

      "gh auth status*": "allow", "gh repo list*": "allow", "gh repo view*": "allow",
      "gh repo clone *": "allow", "gh pr list*": "allow", "gh pr view*": "allow",
      "gh pr diff*": "allow", "gh issue list*": "allow", "gh issue view*": "allow",
      "gh run list*": "allow", "gh run view*": "allow",

      "python3 *": "allow", "pip install *": "allow", "uv *": "allow",
      "npm install*": "allow", "npm ci*": "allow", "npm run *": "allow",
      "terraform fmt*": "allow", "terraform validate*": "allow", "terraform init*": "allow",

      "rm -rf /*": "deny", "rm -rf ~*": "deny",
      "git push --force*": "deny", "git push -f*": "deny",
      "git reset --hard*": "deny", "gh repo delete*": "deny",
      "terraform apply*": "deny", "terraform destroy*": "deny",
      "dd *": "deny", "mkfs*": "deny"
    }
  }
}
EOF
```

**Why each part matters:**

- **`small_model` points at the local model.** By default OpenCode sends minor jobs, like naming sessions, to a cloud model. This keeps everything local.
- **`share: disabled`** turns off session sharing.
- **`limit.context`** matches Ollama's 64K, so OpenCode knows when to compact the conversation.
- **The permission defaults are permissive.** Out of the box, OpenCode lets the agent run almost any shell command without asking. I flipped it to **ask by default**, auto-allowed read-only and routine commands, and hard-denied destructive ones.
- **The last matching rule wins.** That's why the `"*"` catch-all comes first and the denies come last.
- **Everything not listed asks first:** `git commit`, `git push`, `rm`, `sudo`, `curl`, `gh pr create`, `docker`, `kubectl`.
- **`sudo` can't work inside the agent**, because it has no way to type a password. Run those commands yourself.
- **"Always" approvals only last for the current session.** They don't change the config file.

### Step 9: Global rules (`AGENTS.md`)

OpenCode loads `~/.config/opencode/AGENTS.md` into every session. It's read **at session start**, so restart OpenCode after editing it.

```bash
cat > ~/.config/opencode/AGENTS.md <<'EOF'
# Global agent rules

## Finishing tasks
- Keep working until every part of the user's request is done. Never end a turn
  without either calling a tool or giving a final answer.
- Before the final answer, re-read the request and confirm each part was completed.
  If something failed, say what failed.

## Verify, don't assume
- Never assume output is sorted or complete. Sort/filter explicitly
  (e.g. `gh ... --json ... --jq 'sort_by(.updatedAt) | reverse'`).
- After changing anything (file, install, clone, commit), run a command that proves it
  worked (`ls`, `git status`, `git log -1`, `--version`).
- If a command fails, read the error and the `--help` output before retrying.
  Don't retry the same command unchanged.

## Environment
- WSL2 on Windows. Use bash, prefer Python and bash for scripts.
- GitHub: `gh` is authenticated; git uses SSH.
- No sudo: the user runs sudo commands manually. Ask for them when needed.
- Python projects: create a venv (`python3 -m venv .venv`) or use `uv`.
  Never pip install globally.

## Style
- Write notes and docs as Markdown.
- Commit messages: short, imperative ("Add NOTES.md with repo summary").
EOF
```

### Step 10: Test it

```bash
mkdir -p ~/agent-sandbox && cd ~/agent-sandbox && opencode
```

**Test 1: tools and `gh`.** Prompt:

```
use gh to list my 5 most recently updated repos, then clone the first one here
```

What happened:

- It worked. The agent tried a `--sort` flag that doesn't exist, read the error, and switched to `--json name,updatedAt`.
- But it then assumed the JSON was already sorted, which it isn't. The top 5 happened to be right by luck. That's what the "Verify, don't assume" rule is for.

**Test 2: permissions.** Prompt, run inside the cloned repo:

```
show me the git log for the last 5 commits, then create a file NOTES.md with a one-line summary of the repo and commit it
```

| Run | Result |
|---|---|
| gpt-oss, before `AGENTS.md` | Stopped after one tool call with an empty turn. After I typed `continue`, it claimed it had created and committed `NOTES.md` but never actually did. |
| gpt-oss, after `AGENTS.md` | Really committed, and `git commit` stopped for approval ✅. But the file only contained placeholder text, and it skipped verification. |
| Devstral Small 2 | Wrote an accurate one-line summary with the write tool, and the commit stopped for approval ✅. It also skipped verification, and took about 3x longer. |

**Lesson: the agent's final summary is not evidence.** Check with `git status`, `ls`, and `git log -1`.

Clean up afterwards: `git reset --soft HEAD~1 && rm NOTES.md`, or just delete the sandbox clone.

---

## Part 2: Agent on the server, GPU on the PC

The goal: OpenCode runs on the headless Debian server, working on its own files, Docker and k3s inside tmux, while the model runs on the PC's GPU.

**Prerequisites:**

- Part 1 is complete.
- `.wslconfig` has `networkingMode=mirrored`.
- The server is reachable as `deimos.local` (mDNS via avahi).

### Step 11: Find and reserve the LAN IPs

On the **server**:

```bash
hostname -I
# 192.168.1.20 172.17.0.1 10.42.1.x
```

In **PowerShell** on the PC:

```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.PrefixOrigin -eq 'Dhcp' }).IPAddress
# 192.168.56.1  172.24.0.1  192.168.1.10
```

Which ones are real: only the addresses on your router's LAN subnet (`192.168.1.0/24` in this example). The rest are virtual networks:

- On Windows, the extra addresses are virtual adapters, such as Hyper-V or VMware networks.
- On the server, `172.17.0.1` is Docker's bridge.
- On the server, `10.42.x.x` is k3s pod networking.

**Reserve both IPs in your router's DHCP settings.** The firewall rules depend on the server's IP staying the same.

### Step 12: Make WSL Ollama listen on the LAN

Make sure `override.conf` has `OLLAMA_HOST=0.0.0.0:11435`. If you set it to `127.0.0.1` earlier:

```bash
sudo sed -i 's/OLLAMA_HOST=127.0.0.1:11435/OLLAMA_HOST=0.0.0.0:11435/' /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload && sudo systemctl restart ollama
ss -ltn | grep 11435
```

✅ The output shows `*:11435`, meaning it listens on all interfaces, IPv4 and IPv6.

The `export OLLAMA_HOST=127.0.0.1:11435` line in WSL's `~/.bashrc` stays as it is. It only tells the local `ollama` CLI where to connect.

### Step 13: Firewall rules, allowing the server only

**Ollama has no authentication.** Anyone who can reach the port can use the GPU, so lock it to the server's IP.

Run this in **PowerShell as Administrator**:

```powershell
# Hyper-V firewall: in mirrored mode, inbound LAN traffic to WSL is blocked by default
New-NetFirewallHyperVRule -Name "Ollama-WSL-server" -DisplayName "Ollama WSL from server" `
  -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' `
  -Protocol TCP -LocalPorts 11435 -RemoteAddresses 192.168.1.20

# Regular Windows Defender Firewall
New-NetFirewallRule -DisplayName "Ollama WSL from server" -Direction Inbound `
  -Protocol TCP -LocalPort 11435 -RemoteAddress 192.168.1.20 -Action Allow
```

`{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}` is the fixed ID Windows uses for WSL.

**To inspect or remove the rules later:**

```powershell
Get-NetFirewallHyperVRule -Name "Ollama-WSL-server"
Get-NetFirewallRule -DisplayName "Ollama WSL from server"

Remove-NetFirewallHyperVRule -Name "Ollama-WSL-server"
Remove-NetFirewallRule -DisplayName "Ollama WSL from server"
```

If the server's IP ever changes, remove both rules and create them again with the new IP.

### Step 14: Test connectivity from the server

```bash
curl http://gpu-pc.local:11435
curl http://192.168.1.10:11435
```

✅ Both print `Ollama is running`. If only the IP works, mDNS isn't resolving the PC's name, so use the IP in the config in the next step.

### Step 15: Copy the OpenCode config to the server

Run this from **WSL**. It backs up anything already on the server, copies the files over SSH, and points `baseURL` at the PC:

```bash
ssh deimos 'mkdir -p ~/.config/opencode && cd ~/.config/opencode && for f in opencode.json AGENTS.md; do [ -f $f ] && cp $f $f.bak; done; true'
cat ~/.config/opencode/opencode.json | ssh deimos 'cat > ~/.config/opencode/opencode.json'
cat ~/.config/opencode/AGENTS.md     | ssh deimos 'cat > ~/.config/opencode/AGENTS.md'
ssh deimos "sed -i 's#http://127.0.0.1:11435/v1#http://gpu-pc.local:11435/v1#' ~/.config/opencode/opencode.json && grep baseURL ~/.config/opencode/opencode.json"
```

✅ The output shows `"baseURL": "http://gpu-pc.local:11435/v1"`.

Then, **on the server**, update the Environment section of `~/.config/opencode/AGENTS.md`:

```markdown
## Environment
- Debian server (headless). Use bash, prefer Python and bash for scripts.
- Docker and a k3s cluster are available.
- GitHub: `gh` is authenticated.
- No sudo: the user runs sudo commands manually. Ask for them when needed.
- Python projects: create a venv (`python3 -m venv .venv`) or use `uv`.
  Never pip install globally.
```

Also confirm `gh` works on the server:

```bash
gh auth status   # if not logged in: gh auth login
```

**Optional: Docker permissions on the server.** Add these to the `bash` block in the server's `opencode.json`:

```json
"docker ps*": "allow",
"docker logs *": "allow",
"docker compose ps*": "allow",
"docker compose up *": "ask",
"docker rm *": "ask",
"docker system prune*": "deny"
```

### Step 16: Test from the server

On the **server**, preferably inside tmux so the session survives disconnects:

```bash
mkdir -p ~/agent-sandbox && cd ~/agent-sandbox && opencode
```

Prompt:

```
show me the OS version, disk usage of /, and list running docker containers
```

While it runs, check in **WSL** on the PC:

```bash
ollama ps
# NAME           ID              SIZE     PROCESSOR    CONTEXT    UNTIL
# gpt-oss:20b    17052f91a42e    12 GB    100% GPU     65536      4 minutes from now
```

✅ That confirms the agent is running on the server and the model is running on the 5070 Ti, with the full 64K context.

### Caveats for Part 2

- **The PC must be awake.** If Windows sleeps, OpenCode on the server just hangs. Set sleep to "Never" while plugged in, or look into wake-on-LAN.
- **WSL must be running.** Ollama is a systemd service inside WSL, so if WSL shuts down, the endpoint disappears with it. Opening a WSL terminal brings it back.
- **VRAM is shared.** Gaming, or a model loaded in Windows Ollama, competes with the agent. If the agent suddenly slows down, check `ollama ps`.
- **Security is IP-based only.** Never forward port 11435 on the router or expose it through a tunnel.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `This version requires zstd for extraction` | Minimal Ubuntu/Debian lacks zstd | `sudo apt-get install -y zstd` |
| `ollama.service` crash-loops: `bind: address already in use` | Windows Ollama holds 11434 (mirrored networking) | Move WSL Ollama to 11435 (Step 4) |
| `curl localhost:11434` says running but `ss` shows nothing in WSL | You're talking to the **Windows** Ollama | Use port 11435 |
| `ollama ps` shows a `CPU/GPU` split | Context too large, or the other Ollama has a model loaded | Lower the context, or `ollama stop` the other model |
| Very slow prompt eval on the first run | CUDA warm-up | Run again |
| Agent turn ends empty mid-task | gpt-oss quirk: reasoning only, no action | Type `continue` |
| Agent says "done" but nothing changed | Small model claiming work it didn't do | Verify with `git status` / `ls`; try Devstral |
| Rules seem ignored | `AGENTS.md` only loads at session start | Restart OpenCode |
| Server: `curl` to the PC times out | Firewall rule missing, wrong IP, or PC asleep | Check both rules (Step 13), `hostname -I` on the server, wake the PC |
| Server: `gpu-pc.local` doesn't resolve | mDNS issue | Use the PC's IP in `baseURL` |
| Is the prompt being truncated? | | `journalctl -u ollama --no-pager -n 100 \| grep -iE "truncat\|exceed\|error"`. Expect `truncated = 0`; typical prompts are 8–9K tokens. |

## Useful commands

```bash
# WSL (PC)
ollama ps                                  # loaded models, GPU/CPU split, context
ollama stop gpt-oss:20b                    # unload to free VRAM
systemctl status ollama --no-pager         # service health
journalctl -u ollama -f                    # live logs (also shows requests from the server)
cat /etc/systemd/system/ollama.service.d/override.conf
nvidia-smi                                 # VRAM usage

# Server
curl http://gpu-pc.local:11435             # is the GPU box reachable?
grep baseURL ~/.config/opencode/opencode.json
```

## Benchmarks (RTX 5070 Ti, 16GB)

| Model | Eval rate | Prompt eval | VRAM | Context |
|---|---|---|---|---|
| gpt-oss:20b | ~130 tok/s | fast after warm-up | 12GB, 100% GPU | 64K ✅ |
| gpt-oss:20b | — | — | 14GB, 10%/90% CPU/GPU | 128K ❌ |
| devstral-small-2 | ~22 tok/s | ~1000 tok/s | 15GB, partly CPU | 32K |

---

## Lessons learned

1. **The model is only half of it.** The harness, permissions and rules file matter as much as the model does.
2. **16GB of VRAM is the sweet spot for 20B-class models.** A 24B model technically loads, but spilling onto the CPU makes it about 6x slower.
3. **Context length costs VRAM.** Find the largest value that keeps `100% GPU`, using `ollama ps` to check.
4. **Default permissions are wide open.** Lock them down before the first real task.
5. **Small models are good at chores and unreliable at judgment.** Use them for setup and command work, and use a bigger model, or yourself, for anything that needs real understanding.
6. **Trust, but verify.** The agent's summary describes what it meant to do, not what it actually did.
7. **One GPU, many clients.** WSL mirrored networking plus two firewall rules turn a gaming PC into a private model server for the whole home lab.
