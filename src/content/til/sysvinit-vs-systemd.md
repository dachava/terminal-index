---
title: "sysvinit still boots faster than you think on minimal installs"
pubDate: 2026-04-01
tags: ["linux", "devuan", "init"]
---

Conventional wisdom says systemd boots faster because of parallel service startup. True on bloated installs. On a minimal Devuan box with ~30 services, sysvinit cold-boots to login in under 4 seconds — competitive with systemd on the same hardware because there's simply less to start.

The real win is predictability. Boot sequence is a shell script you can read top to bottom. No unit dependency graph to debug, no `systemctl list-dependencies --reverse` spelunking when something breaks at 2am.

```bash
# Everything that runs at boot, in order, no surprises
ls /etc/rc2.d/
```

If you've never read an init script, `/etc/init.d/networking` is a good place to start. It's just bash.
