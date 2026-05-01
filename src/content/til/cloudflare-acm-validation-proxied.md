---
title: "ACM DNS validation hangs if the Cloudflare record is proxied"
pubDate: 2026-05-02
tags: ["aws", "cloudflare", "terraform", "devops"]
---

When validating an ACM certificate via DNS, AWS polls for a specific CNAME value. If that record is proxied through Cloudflare (orange cloud), Cloudflare intercepts the request and AWS sees Cloudflare's IP instead of the record value it's looking for. Validation hangs indefinitely with no useful error message.

The fix in Terraform:

```hcl
resource "cloudflare_record" "acm_validation" {
  ...
  proxied = false
}
```

DNS-only on the validation record. You can proxy the actual API subdomain all you want, but the `_acme-challenge` CNAME has to be unproxied or the cert never issues.
