---
title: "The Terraform Module Pattern That Actually Scales"
description: "Most Terraform tutorials show a big main.tf. That works until you need a second environment, a second team, or a reason to tear things down without nuking your domain. Here's the pattern that fixes all three."
pubDate: 2026-03-13
tags: ["terraform", "aws", "devops", "infrastructure", "iac"]
draft: false
---

Most Terraform tutorials look like this:

```
main.tf
variables.tf
outputs.tf
```

Everything in one file, one directory, one state. You run `terraform apply` and your whole infrastructure goes up. You run `terraform destroy` and your whole infrastructure goes down.

That's fine for a tutorial. It falls apart the moment you need a second environment.

---

## The problem with flat Terraform

Say you want a `dev` environment and a `prod` environment. With a flat structure you have two options:

1. **Duplicate everything.** Copy `main.tf` into `dev/` and `prod/`, keep them in sync manually. Two codebases, double the drift, infinite the regret.

2. **Use workspaces.** Terraform workspaces let you share code across environments by switching state. They work, but they're fragile... a single `terraform destroy` in the wrong workspace is very bad.

Neither is good. The real answer is a different structure entirely.

---

## Modules + envs: the pattern

Split your Terraform code into two layers:

```
infra/
  modules/       ← reusable infrastructure definitions
    api/
    domain/
  envs/          ← environment-specific composition
    dev/
    prod/
    dev-domain/
    prod-domain/
```

**Modules** define *what* infrastructure looks like. They're parameterized, reusable, and environment-agnostic.

**Envs** define *which* infrastructure exists and *how it's configured* for a specific environment. They call modules with the right variable values.

An env is just a thin composition layer:

```hcl
# infra/envs/dev/main.tf
module "api" {
  source = "../../modules/api"

  project_name       = var.project_name
  environment        = "dev"
  lambda_memory_mb   = 512
  log_retention_days = 7
  ecr_image_uri      = var.ecr_image_uri
}
```

The `prod` equivalent calls the same module with different values:

```hcl
# infra/envs/prod/main.tf
module "api" {
  source = "../../modules/api"

  project_name       = var.project_name
  environment        = "prod"
  lambda_memory_mb   = 1024
  log_retention_days = 90
  ecr_image_uri      = var.ecr_image_uri
}
```

Same module. Different config. No duplication.

---

## Each env gets its own state

Every env directory has its own backend configuration pointing to a unique state key in S3:

```hcl
# infra/envs/dev/backend.tf
terraform {
  backend "s3" {
    bucket = "echo-mind-tfstate"
    key    = "echo-mind/dev/terraform.tfstate"
    region = "us-east-1"
  }
}
```

```hcl
# infra/envs/prod/backend.tf
terraform {
  backend "s3" {
    bucket = "echo-mind-tfstate"
    key    = "echo-mind/prod/terraform.tfstate"
    region = "us-east-1"
  }
}
```

Same S3 bucket, different keys. Each environment is completely isolated. `terraform destroy` in `envs/dev` cannot touch `envs/prod`. Not by convention, by design.

### State locking

When two applies run against the same state file simultaneously, you get corruption. State locking prevents that, only one operation can hold the lock at a time.

The old solution was a DynamoDB table alongside your S3 bucket. It worked, but it was friction: another AWS resource to provision, another IAM permission to wire up, another thing to forget.

Terraform 1.11 shipped native S3 locking. No DynamoDB needed:

```hcl
terraform {
  backend "s3" {
    bucket       = "echo-mind-tfstate"
    key          = "echo-mind/dev/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

Under the hood it uses S3's conditional writes (`If-None-Match: *`) to atomically create a `.tflock` file next to the state. If another apply is already running, the write fails and Terraform waits. Same guarantee, zero extra infrastructure.

---

## Splitting state by lifecycle

This is where it gets interesting.

Some infrastructure has a different lifecycle than your application. An ACM certificate and its DNS records should survive when you tear down and redeploy the app stack. They're long-lived, and re-issuing a certificate takes time.

The solution is a separate stack for that infrastructure:

```
infra/envs/dev/           # app stack: Lambda, ECR, API Gateway
infra/envs/dev-domain/    # domain stack: ACM cert, DNS records, custom domain mapping
```

Each has its own state key. `terraform destroy` in `envs/dev` tears down the app without touching the domain.

But the domain stack needs to know the API Gateway ID from the app stack. That's where **remote state** comes in:

```hcl
# infra/envs/dev-domain/main.tf
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

`terraform_remote_state` reads the outputs from another stack's state file. The domain stack stays in sync with the app stack automatically, after every app redeploy, one `terraform apply` in `dev-domain` re-points the custom domain at the new API Gateway.

---

## What this looks like in practice

Tear down the app, keep the domain:
```bash
cd infra/envs/dev && terraform destroy     # Lambda, ECR, API GW gone
# ACM cert and DNS records are untouched
```

Redeploy the app:
```bash
cd infra/envs/dev && terraform apply       # app stack back up
cd infra/envs/dev-domain && terraform apply  # domain re-pointed, no cert reissue
```

Add a prod environment:
```bash
cd infra/envs/prod && terraform apply       # same modules, prod config
cd infra/envs/prod-domain && terraform apply
```

The modules haven't changed. The only new code is the composition in `envs/prod/`.

---

## The mental model

Think of it this way:

- **Modules** are functions. They take inputs and produce infrastructure.
- **Envs** are call sites. They pass the right arguments for the context.
- **State** is scoped to the call site, not the function.

This is the same principle as application code... you write reusable functions and call them with different arguments. The Terraform module pattern just applies it to infrastructure.

When you get here, adding a new environment is boring. Which is exactly what you want. Boring infrastructure means your interesting work is in the application layer, where it belongs.
