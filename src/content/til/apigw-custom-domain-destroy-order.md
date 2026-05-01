---
title: "AWS won't delete an API Gateway stage that has an active custom domain mapping"
pubDate: 2026-05-01
tags: ["aws", "terraform", "devops", "infrastructure"]
---

If you try to `terraform destroy` an API Gateway stack that has a custom domain mapping attached, AWS throws an error and refuses to delete the stage. The custom domain mapping has to be removed first.

This is a good argument for keeping domain infrastructure in a separate Terraform stack with its own state. Destroy the domain stack first, then the app stack, and AWS has no objections.

```
# correct order
cd infra/envs/dev-domain && terraform destroy
cd infra/envs/dev       && terraform destroy
```

Trying to do it in a single stack forces you to either manually detach the mapping in the console or add explicit `depends_on` and `destroy` ordering hacks to your Terraform config.
