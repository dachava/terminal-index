---
title: "BuildKit adds provenance attestations that break Lambda deploys"
pubDate: 2026-04-28
tags: ["docker", "aws", "lambda", "devops"]
---

Modern Docker Desktop enables BuildKit by default. BuildKit attaches provenance attestations to images, producing an OCI image manifest. Lambda only accepts Docker manifest v2 schema 2 and will silently fail when it tries to pull an OCI manifest.

The failure mode is sneaky: `docker push` succeeds, the image looks fine in ECR, but Lambda errors on deploy with a cryptic `ResourceNotFoundException`.

Fix is one flag:

```bash
docker build --provenance=false -t my-image .
```

Worth adding this to any build script that targets Lambda so you don't chase the same ghost twice.
