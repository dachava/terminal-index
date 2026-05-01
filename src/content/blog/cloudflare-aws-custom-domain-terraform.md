---
title: "Automating a Hybrid Cloudflare + AWS Custom Domain with Terraform"
description: "How I wired Cloudflare DNS to an AWS API Gateway custom domain in a single terraform apply with no manual DNS steps and a split-state design that survives rebuilds."
pubDate: 2026-05-02
tags: ["terraform", "aws", "cloudflare", "devops", "infrastructure"]
draft: false
---

When I set up the backend for my portfolio project, I made a deliberate choice: **Cloudflare for DNS, AWS for compute, Terraform to coordinate both.** It's a pattern I'd seen in production systems but never wired up myself. Besides, I'm already paying for it so why not?

---

## The Architecture

```
Browser → Cloudflare DNS → CNAME → API Gateway custom domain → Lambda
```

`api.dachava.dev` is a CNAME in Cloudflare pointing to an AWS API Gateway regional endpoint. API Gateway serves TLS using an ACM certificate. Lambda handles the actual requests. Three vendors, one domain, fully automated.

### Why not just use Route 53?

Route 53 would be much simpler but there are reasons not to:

- **Cost**: Cloudflare's free tier handles DNS, DDoS protection, and a basic WAF at no charge. Route 53 is ~$0.50/zone/month.
- **Vendor isolation**: DNS and compute are decoupled. I can migrate the backend to a different cloud provider without touching DNS, and vice versa.
- **Cloudflare's edge benefits**: Proxy mode (when I want it) gives me free DDoS mitigation and analytics with zero backend changes.

The tradeoff is managing two providers in Terraform, but in reality it turned out to be less painful than expected.

---

## The Automation Problem

ACM certificate validation via DNS has a sequencing problem. AWS issues a certificate, gives you a CNAME record to add to your DNS, then polls for it. The naive workflow looks like this:

1. Run `terraform apply`: creates the cert and immediately hangs waiting for DNS validation
2. Open another terminal, run `terraform output` to get the CNAME values... **outputs aren't written to state until apply completes**
3. Manually add the records to Cloudflare
4. Wait for ACM to detect them
5. Apply finishes

This is miserable and very impractical. It turns a one-command deploy into a multi-step manual process with a 20+ minute wait the first time.

### The fix: Cloudflare Terraform provider

The Cloudflare provider eliminates all of that. Terraform creates the ACM cert, reads `domain_validation_options` directly (before the cert is validated), creates the CNAME in Cloudflare, then passes `validation_record_fqdns` to `aws_acm_certificate_validation`. AWS knows exactly which record to poll. No hanging, no manual steps.

```hcl
resource "cloudflare_record" "acm_validation" {
  for_each = {
    for dvo in aws_acm_certificate.this.domain_validation_options :
    dvo.domain_name => {
      name  = trimsuffix(trimsuffix(dvo.resource_record_name, "."), ".${data.cloudflare_zone.this.name}")
      value = trimsuffix(dvo.resource_record_value, ".")
    }
  }

  zone_id = var.cloudflare_zone_id
  name    = each.value.name
  type    = "CNAME"
  content = each.value.value
  proxied = false
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for r in cloudflare_record.acm_validation : r.hostname]
}
```

`for_each` on `domain_validation_options` (a set) handles multi-SAN certs cleanly. The `trimsuffix` calls strip the trailing dot and zone name that ACM appends. Cloudflare wants a relative name, not a fully-qualified one.

A single `terraform apply` now does everything: issues the cert, creates the DNS validation record, waits for ACM to confirm, creates the API Gateway custom domain, and creates the final API CNAME. No manual intervention.

---

## Split State for Lifecycle Isolation

The domain infrastructure has a different lifecycle than the application. The ACM certificate and DNS records should survive when I tear down and redeploy the app backend. They're long-lived, shared infrastructure.

The solution is two separate Terraform stacks with separate state keys in the same S3 bucket:

```
echo-mind/dev/terraform.tfstate         # Lambda, ECR, API Gateway, S3
echo-mind/dev-domain/terraform.tfstate  # ACM cert, Cloudflare DNS, API GW custom domain
```

The domain stack reads the API Gateway ID from the app stack's remote state:

```hcl
data "terraform_remote_state" "dev" {
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key    = "echo-mind/dev/terraform.tfstate"
    region = var.region
  }
}

module "domain" {
  api_id = data.terraform_remote_state.dev.outputs.api_id
  ...
}
```

Now `terraform destroy` in the app stack tears down Lambda, ECR, API Gateway, and S3... but leaves the cert and DNS records untouched. After redeploying the app, one `terraform apply` in the domain stack re-points the domain at the new API Gateway. The cert is never re-issued.

---

## Lessons Learned

**ACM validation records must be DNS-only.** If Cloudflare's proxy is enabled (orange cloud) on the validation CNAME, ACM can't see the record value it's polling for. Validation hangs indefinitely. `proxied = false` is mandatory on that record.

**Non-HashiCorp providers must be declared in child modules.** A Terraform module that uses the Cloudflare provider needs its own `terraform { required_providers {} }` block. Without it, Terraform tries to find `hashicorp/cloudflare`, which doesn't exist, and `terraform init` fails.

**`value` is deprecated in Cloudflare provider v4.** Use `content` instead. `value` still works but generates warnings and will break in v5.

**API Gateway stage deletion ordering matters.** AWS refuses to delete a stage that has an active custom domain mapping. The fix is to destroy the domain stack before the app stack. the split state design enforces this naturally.

**Existing manual DNS records block Terraform.** If you've previously set up the same records by hand in Cloudflare, Terraform errors with *"expected DNS record to not already be present."* Delete them from the dashboard before applying.

---

## The Result

```bash
# Full deploy from scratch:
cd infra/envs/dev && terraform apply
cd infra/envs/dev-domain && terraform apply

# Test:
curl https://api.dachava.dev/health
```

Two commands. No manual DNS steps, no waiting, no copying values between terminals. The Cloudflare provider handles DNS, ACM handles TLS, and Terraform coordinates the sequencing across both vendors.

The split-state design means the domain is permanent infrastructure while the app can be rebuilt freely, which is exactly the right separation for a project that'll keep evolving.
