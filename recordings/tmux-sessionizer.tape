# Hero GIF for src/content/blog/tmux-sessionizer-part-2.md
# Run from the repo root on deimos:  vhs recordings/tmux-sessionizer.tape

Output public/images/blog/tmux-sessionizer.gif

Require tmux
Require fzf
Require tmux-sessionizer
Require claude

Set Shell bash
Set FontSize 16
Set Width 1400
Set Height 750
Set Padding 20
Set Framerate 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 80ms

# Setup (not recorded): VHS starts bash without ~/.bashrc, so load it for the
# Ctrl+f binding. A throwaway TMUX_TMPDIR gives the demo its own tmux server,
# so your real sessions are neither shown nor touched.
Hide
Type "export TMUX_TMPDIR=$(mktemp -d) && unset TMUX && source ~/.bashrc && clear"
Enter
Sleep 1s
Show

# Bare shell: Ctrl+f opens the picker
Sleep 1s
Ctrl+F
Sleep 1s
Type "portfolio"
Sleep 700ms
Enter
Sleep 1.5s

# Build the workspace: files top-left, Claude Code on the right, git log bottom-left
Type "ls"
Enter
Sleep 1s
Ctrl+A
Type "|"
Sleep 500ms
Type "claude"
Enter
Sleep 4s
Ctrl+A
Type "h"
Sleep 300ms
Ctrl+A
Type "-"
Sleep 500ms
Type "git log --oneline -5"
Enter
Sleep 2s

# Inside tmux: Ctrl+a f jumps to another project
Ctrl+A
Type "f"
Sleep 1s
Type "terrafax"
Sleep 700ms
Enter
Sleep 1s
Type "ls"
Enter
Sleep 1.5s

# And back: the portfolio session, panes and Claude, exactly as they were left
Ctrl+A
Type "f"
Sleep 1s
Type "portfolio"
Sleep 700ms
Enter
Sleep 3s

# Cleanup (not recorded): kill only the demo tmux server (and Claude with it)
Hide
Ctrl+A
Type "d"
Sleep 500ms
Type "tmux kill-server; rm -rf $TMUX_TMPDIR"
Enter
Sleep 500ms
