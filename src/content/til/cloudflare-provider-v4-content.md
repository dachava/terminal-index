---
title: "Cloudflare Terraform provider v4 deprecated `value`, use `content`"
pubDate: 2026-05-02
tags: ["terraform", "cloudflare", "devops"]
---

In Cloudflare's Terraform provider v4, the `value` argument on `cloudflare_record` was deprecated in favor of `content`. Using `value` still works but generates warnings on every plan and will break in v5.

```hcl
# before (v3 style)
resource "cloudflare_record" "api" {
  value = aws_api_gateway_domain_name.this.regional_domain_name
}

# after (v4+)
resource "cloudflare_record" "api" {
  content = aws_api_gateway_domain_name.this.regional_domain_name
}
```

Easy fix, but easy to miss if you're copying examples from older blog posts or the provider's own older docs.
