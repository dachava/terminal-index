---
title: "Querying IMDSv2 from the CLI requires a token first"
pubDate: 2026-04-10
tags: ["aws", "security", "cloud"]
---

IMDSv2 (Instance Metadata Service v2) requires a session-oriented token before any metadata call — a defense against SSRF attacks that plagued IMDSv1. The two-step is easy to forget when writing quick debug scripts.

```bash
# Step 1 — get a token (TTL in seconds)
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

# Step 2 — use it
curl -sH "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

Worth enforcing IMDSv2-only on all instances via instance metadata options — `HttpTokens: required`. Anything still using v1 is a misconfiguration waiting to be a finding.
