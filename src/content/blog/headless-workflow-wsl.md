---
title: "Building a Headless Workflow with WSL, tmux, and Claude Code"
description: "Or: how I stopped clicking around in a server GUI and started shipping."
pubDate: 2026-05-24
updatedDate: 2026-05-24
tags: ["linux", "tmux", "wsl", "workflow"]
draft: false
---

For longer I'd like to admit, I was reaching my servers from a Win 11 LTSC rig wiring them with MobaXterm. I'd log into the server, fire up its full GUI, and do most of my work inside the server's desktop. You can imagine the kind of hack this workflow is...

# I was lazy but ended wasting more time instead!

This post is the first half of how I tore that down and rebuilt it: Getting from Windows to the server cleanly, persistent terminals, and an editor that doesn't suck. 

---

## KILL the server's GUI

There's simply no way around this: **the server must be headless.**

Its job is to run processes, hold files, and accept SSH connections. That's it. No desktop environment, no browser, no GUI text editor. Besides, it's more attractive and efficient to work in a CLI, a beautiful craft.

The question now is: How to make Windows a better client to a headless box?

### The stack I landed on:

1. Windows Terminal + WSL2 as the local shell environment
2. SSH with key auth + agent caching so connections are instant and passwordless
3. mDNS hostname resolution so I never hardcode IPs
4. tmux on the server for persistent, multiplexed sessions
5. VSCodium with Open Remote-SSH for editing files on the server with a real IDE
6. Claude Code running on the server, accessible from any terminal or VSCodium itself

## Windows-side foundation

If you've already got Windows Terminal and WSL2 (with Debian or Ubuntu) installed, skip ahead. If not, download Windows Terminal then in PowerShell:

```powershell
wsl --install -d Debian
```
Reboot and finish WSL setup, done. 

### Networking considerations
I require a stable IP address for the server and proper hostname resolution.

No `/etc/hosts` or hostfile hacks, I still see this in customer's envirnments and it's such a bad practice,  disgusting.

Simply locate the dev server by MAC address, and reserve its current IP in the router's settings. 

## Resolving the hostname from WSL
PowerShell could ping my server by hostname, WSL couldn't. After diagnosing, the answer was:

Windows resolves the server via mDNS (the .local namespace), not DNS through the router. WSL2 in default networking mode doesn't participate in mDNS.

Two fixes, both useful:

### Switch WSL2 to mirrored networking mode
Create `C:\Users\<you>\.wslconfig`

````ini
[wsl2]
networkingMode=mirrored
````
Then from PowerShell: `wsl --shutdown` then reopen WSL. Mirrored mode makes WSL share Windows' network interface. LAN broadcasts work, mDNS works, port forwarding becomes trivial. There's basically no downside for a dev workflow.

### Install mDNS support in WSL
````bash
sudo apt install -y avahi-daemon libnss-mdns avahi-utils
# Verify it hooked into name resolution:
grep ^hosts /etc/nsswitch.conf
````
Look for a line that includes the `mdns4_minimal`. Ping the server and should work.

## SSH for Professionals
The whole point is: `ssh server` should land in a shell instantly. No password, no IP, no remembering anything.

#### Generate key
From WSL run:
````bash
ssh-keygen -t ed25519 -C "wsl-to-progeny"
````
In this step I used a passphrase. If you are lazy... well, you can skip it.

#### Push the key to the server
````bash
ssh-copy-id user@server.local
````
You'll be prompted for the server password once. After that, the key is installed in ``~/.ssh/authorized_keys``.

#### Config file
This is where the magic happens, create `~/.ssh/config` in WSL:

````bash
Host progeny
    HostName progeny.local
    User misterx
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
    ServerAliveCountMax 3
````
Now `ssh progeny` does all the work and everything is automatic.
````bash
chmod 600 ~/.ssh/config
````
#### Don't enter the passphrase every time
If you used a passphrase, you'll be prompted for it on every connect. Fix: use `keychain` to cache the unlocked key in an ssh-agent that survives across terminals.
````bash
sudo apt install -y keychain
echo 'eval "$(keychain --eval --quiet ~/.ssh/id_ed25519)"' >> ~/.bashrc
source ~/.bashrc
````
You'll be prompted once per WSL cold boot. Every terminal you open after that inherits the unlocked agent. `ssh progeny` becomes truly one-keystroke.

#### VSCodium and PowerShell too
Not everything in Micro soft has to be painful. Allow VSCodium and PowerShell on Windows to enjoy the same passwordless flow and enable the ssh-agent service. Run PowerShell as Admin:

````powershell
Set-Service -Name ssh-agent -StartupType Automatic
Start-Service ssh-agent
ssh-add $env:USERPROFILE\.ssh\id_ed25519
````
Confirm that the Windows SSH config `C:\Users\<user>\.ssh\config` has the same Host `progeny or whatever your server is` block plus this line:

````ini
IdentityAgent \\.\pipe\openssh-ssh-agent
````
Now the tools talk to the same persistent agent, and everyone is very friendly now.

## tmux: Unleash The Beast
This is the breaking point and will turn the experience from a simple " box I SSH into" to ''a persistent customizable workspace."

Each tmux session is a workspace that lives on the server even when disconnected. Inside a session, windows are tabs. Inside windows, panes are splits. Detach with a keystroke, the session keeps running, reattach later and pick up exactly where you left off.

Simply install with:
```bash
sudo apt install -y tmux
```
Default tmux is functional but I find the keybindings quite awkward. Drop this in ``~/.tmux.conf``:

````bash
# Better prefix Ctrl+a
unbind C-b
set -g prefix C-a
bind C-a send-prefix

# Sensible defaults
set -g default-terminal "tmux-256color"
set -as terminal-features ",xterm-256color:RGB"
set -as terminal-features ",tmux-256color:RGB"
set -g mouse on
set -g history-limit 50000
set -g base-index 1
setw -g pane-base-index 1

# Reload with prefix + r
bind r source-file ~/.tmux.conf \; display "Config reloaded"

# Intuitive splits that remember the working directory
bind | split-window -h -c "#{pane_current_path}"
bind - split-window -v -c "#{pane_current_path}"
unbind '"'
unbind %

# Vim-like pane navigation
bind h select-pane -L
bind j select-pane -D
bind k select-pane -U
bind l select-pane -R

# Copy mode with vi keys, push to system clipboard via OSC52
setw -g mode-keys vi
bind -T copy-mode-vi v send-keys -X begin-selection
bind -T copy-mode-vi y send-keys -X copy-selection-and-cancel
set -s set-clipboard on

# Status bar
set -g status-position bottom
set -g status-style "bg=default,fg=white"
set -g status-left "#[fg=green]#S "
set -g status-right "#[fg=yellow]%Y-%m-%d #[fg=cyan]%H:%M"
set -g status-left-length 30
````
Kill any running sessions to start fresh with `tmux kill-server` and `tmux new -s work`.

#### Essential Commands
The prefix is `Ctrl+a`. Press it, release, then tap the next key.
 
| Action | Keys |
|---|---|
| New window | `Ctrl+a` `c` |
| Split vertical | `Ctrl+a` `\|` |
| Split horizontal | `Ctrl+a` `-` |
| Move between panes | `Ctrl+a` `h/j/k/l` |
| Detach (leave running) | `Ctrl+a` `d` |

### The pattern
```bash
# from WSL
ssh progeny
tmux new -s main      # first time
# ...do work...
Ctrl+a d              # detach
exit                  # close SSH
```
Later:
```bash
ssh progeny
tmux attach -t main   # pick right back up
```
Make it one command from WSL:
```bash
alias dev='ssh -t deimos "tmux new-session -A -s main"'
```
Now typing `dev` from any WSL terminal SSHs in, attaches to your `main` session (or creates it), and drops you in. Two letters. Daily startup ritual: gone.
 
---
## VSCodium with Remote-SSH
 
Everything above is great for terminal work. For editing? You still want an IDE. The trick is: VSCodium runs locally on Windows, but its file tree, terminals, extensions, and language servers all operate against the server's filesystem. Best of both worlds.
 
Install **Open Remote - SSH** by jeanp413 from the Open VSX marketplace (the open-source-friendly version of Microsoft's Remote-SSH, which is restricted to official VS Code only).
 
Then `Ctrl+Shift+P` → `Remote-SSH: Connect to Host` → pick `progeny`. New window opens. Bottom-left shows `SSH: pprogeny`. Open a folder via `File → Open Folder` — and the file dialog is browsing the **server's** filesystem.
 
Install your language extensions on the remote side: Python, HashiCorp Terraform, YAML, GitLens, whatever you use. The editor runs locally; the extensions run on the server where they can see your interpreters and binaries.
 
The killer feature: **automatic port forwarding**. Run `python3 -m http.server 8000` in VSCodium's integrated terminal, a notification pops up offering to open it. Click it, and `http://localhost:8000` in your Windows browser is hitting the server. No more browsing inside the server's GUI to check localhost apps. The server's GUI can go.
 
---
## What this gets you
 
After all of the above:
 
- **One word from WSL**: lands you in a persistent workspace on the server, no passwords or hostnames to remember
- **Sessions survive everything**: network drops, closed terminals, WSL restarts, Windows reboots (anything short of a server reboot, since tmux is in RAM)
- **The server is fully headless**: no GUI, no browser, no desktop environment, just SSH and processes
- **VSCodium edits remote files like local ones**: with port-forwarded localhost apps in your Windows browser
- **The whole thing is reproducible**: every config is a text file, every step is in your shell history, every machine you ever set up follows the same playbook
  
It also sets the stage for the real payoff: agentic AI tools like Claude Code, running on the server inside tmux sessions. Long-running agent tasks that survive disconnects, projects with persistent context, the works.
 
---
 
## What's next
 
This is the foundation. Part 2 is where it gets fun: **a tmux sessionizer with fzf** that lets me jump between projects with two keystrokes, plus the per-project session layouts I've been building on top with `tmuxp`. 

Suddenly the friction of "switching projects" which used to mean opening new terminals, navigating directories, re-launching tools... collapses into a fuzzy finder and a keypress.
 
Headless workflow is the only way forward. The reduction in friction is one of those things you don't believe until you've done it.
