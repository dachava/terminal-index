---
title: "Headless Part 2: A tmux Sessionizer for Real Engineering"
description: "One keystroke, fuzzy-pick a project, you're golden. Part 2 of the headless dev workflow series."
pubDate: 2026-06-19
updatedDate: 2026-10-15
tags: ["linux", "tmux", "workflow"]
draft: false
---

*Part 2 of the headless dev workflow series. [Read Part 1 here](/blog/headless-workflow-wsl).*

---

## The "one session" trap

Part 1 ended with a setup I genuinely love: WSL on the Windows rig, SSH into my dev box, one persistent tmux session, VSCodium and Claude Code riding on top. Detach, close the laptop, come back tomorrow, everything is exactly where you left it.

That works perfectly for one project. Then you start a second. Then another one, another one... Suddenly that single session is a junk drawer: a Terraform plan in one window, a Claudio conversation with zero context, a hell of panes `cd`'d into directories unknown. The cure becomes worse than the disease.

The fix isn't more discipline. It's making project switching cost nothing: **one keystroke, fuzzy-pick a project, you're golden.**

![Pressing Ctrl+f opens a fuzzy project picker; the portfolio session opens with Claude Code in a split pane, Ctrl+a f hops to another project and back, and every pane is exactly as it was left](/images/blog/tmux-sessionizer.gif)

---

## The mental model: one session per project

Before any tooling, the rule:

- **Every project gets its own named tmux session.**
- **The session name matches the directory name**, so `tmux ls` doubles as a project dashboard.
- **Sessions live independently.** Detaching from one doesn't touch the others.
- **Switching projects means switching sessions**, never opening a new terminal.

Everything else in this post just makes that rule ergonomic.

---

## The sessionizer: ~20 lines of Bash

This pattern comes straight from [ThePrimeagen's tmux-sessionizer](https://github.com/ThePrimeagen/.dotfiles), which is about as canonical as tmux tooling gets. Mine is a trimmed-down version pointed at where my projects actually live.

Install `fzf` on the server:

```bash
sudo apt install -y fzf
```

Then create `~/.local/bin/tmux-sessionizer`:

```bash
#!/usr/bin/env bash
# Fuzzy-find a project dir and create/switch to its tmux session

if [[ $# -eq 1 ]]; then
    selected=$1
else
    selected=$(find ~/Source/dev -mindepth 1 -maxdepth 1 -type d 2>/dev/null | fzf)
fi

[[ -z $selected ]] && exit 0

selected_name=$(basename "$selected" | tr . _)

if ! tmux has-session -t="$selected_name" 2>/dev/null; then
    tmux new-session -ds "$selected_name" -c "$selected"
fi

if [[ -z $TMUX ]]; then
    tmux attach -t "$selected_name"
else
    tmux switch-client -t "$selected_name"
fi
```

```bash
chmod +x ~/.local/bin/tmux-sessionizer
```

What it does, top to bottom:

1. **Pick a project.** Pass a path as an argument and it jumps straight there. With no argument, it lists every directory one level under `~/Source/dev` and pipes them into `fzf`.
2. **Bail cleanly.** Hit `Esc` in the picker and `$selected` is empty, so the script exits without doing anything.
3. **Sanitise the name.** tmux treats dots in session names as separators, so `my.project` becomes `my_project`.
4. **Create if missing.** If no session with that name exists, create one *detached* (`-d`) and start it in the project directory (`-c`).
5. **Attach or switch.** If `$TMUX` is empty you're outside tmux, so attach. If you're already inside, `switch-client` swaps the current client to the new session. That one check is what lets the same script work from both places.

> **Multiple project roots?** Pass several paths to `find`: `find ~/Source/dev ~/work ~/clients -mindepth 1 -maxdepth 1 -type d`.

---

## Binding it to a keystroke (two of them)

The script on its own is just a command. The *binding* is what turns it into a workflow. I bind it twice, because there are two places I'm likely to be when I want to jump.

### Inside tmux: `Ctrl+a f`

Add this to `~/.tmux.conf` (prefix is `Ctrl+a`, per Part 1's config):

```bash
bind f run-shell "tmux neww ~/.local/bin/tmux-sessionizer"
```

Reload with `Ctrl+a r`. Now `Ctrl+a f` from inside any session opens the picker in a temporary window. Pick a project and the client switches over; the temporary window closes on its own.

### At a bare shell: `Ctrl+f`

This is the one I use most. I SSH into `deimos`, land in a plain bash prompt, hit `Ctrl+f`, and the project list is already on screen. It's a single readline binding in `~/.bashrc`:

```bash
bind '"\C-f":"tmux-sessionizer\n"'
```

```bash
source ~/.bashrc
```

When you press `Ctrl+f`, readline types `tmux-sessionizer` and presses Enter for you. (This assumes `~/.local/bin` is on your `PATH`, which it is by default on Debian.)

> **Gotcha:** `Ctrl+f` normally moves the cursor forward one character. If you rely on that, pick another key, like `\C-o`.

### Pick one entry pattern

You might be tempted to also auto-attach to tmux on SSH login:

```bash
if [[ -z "$TMUX" ]] && [[ -n "$SSH_CONNECTION" ]]; then
    tmux attach 2>/dev/null || tmux new-session -s main
fi
```

That works, but it means you never see a bare prompt, so `Ctrl+f` never fires. Pick one:

| Entry pattern | What happens on SSH | Your switcher |
|---|---|---|
| Bare shell (my choice) | Plain prompt | `Ctrl+f` |
| Auto-attach | Straight into tmux | `Ctrl+a f` |

Both bindings can live in your config at the same time without conflicting. Only one of them gets used, depending on where you land.

---

## Consistent layouts with tmuxp

Once switching is instant, the next bit of friction shows up: every new session starts as a single blank pane, and you rebuild the same layout by hand. Claude Code on the left, a shell on the right, maybe a second window for Terraform.

[tmuxp](https://github.com/tmux-python/tmuxp) fixes that with a YAML file per project:

```bash
pip install --user tmuxp
```

`.tmuxp.yaml` in the project root:

```yaml
session_name: terraform-prod
start_directory: ~/Source/dev/terraform-prod
windows:
  - window_name: main
    layout: main-vertical
    panes:
      - claude
      - git status
  - window_name: terraform
    panes:
      - terraform fmt && terraform validate
```

```bash
tmuxp load ~/Source/dev/terraform-prod/.tmuxp.yaml
```

That one command gives you the session with the right name, in the right directory, with Claude Code launching in the main pane, git beside it, and a second window ready for whatever you want.

The best part is that **the layout is committed to the repo.** New server, fresh clone, `tmuxp load`, and the whole workspace is back.

### The lighter alternative

tmuxp is the heavyweight option. If one layout works for every project, a small startup script is enough. Drop a `.tmux-start.sh` in the project root and run it inside a fresh session:

```bash
#!/usr/bin/env bash
tmux rename-window main
tmux send-keys 'claude' C-m        # left pane: Claude Code
tmux split-window -h -p 40         # right pane, 40% width
tmux send-keys 'git status' C-m
tmux select-pane -L                # focus back on Claude
```

---

## The daily loop

Here's what a normal day looks like now:

```
1. Open the WSL terminal
2. ssh deimos           → bare shell
3. Ctrl+f               → fuzzy-pick "terraform-prod" → session created or resumed
4. Work. Claude edits in one pane, git/terraform in the other
5. Ctrl+a f             → "python-tools" → switched, Terraform session untouched
6. Ctrl+a d             → detach, close the terminal, sessions keep running
7. Tomorrow: ssh deimos, Ctrl+f, pick a project, exactly where you left off
```

There's no re-explaining context to Claude, no `cd` chains, no re-launching anything. Every project is a workspace you suspend and resume.

A side benefit: each project session is also its own Claude Code workspace. Claudio picks up the repo's `CLAUDE.md` automatically, so each session starts with the right context without any extra work. And VSCodium still works exactly as in Part 1 for editing-heavy days. The sessionizer is for terminal-first work, and the two coexist fine.

---

## Wrapping up

What kills flow isn't hard problems. It's the small tax of switching context: finding the right terminal, remembering the right directory, rebuilding the right layout... it's just so boring. Once jumping between projects costs nothing and everything resumes exactly as you left it you stop avoiding the switch, and you keep your momentum.

**Next up, Part 3:** wiring Claude Code into the stack with MCP servers (AWS, Terraform, Context7, Serena), the piece that turns this from a fast terminal setup into a properly agentic one.

<!-- *My dotfiles, including the sessionizer, tmux.conf and bashrc bits, are [here](LINK-TO-DOTFILES).*
 -->

