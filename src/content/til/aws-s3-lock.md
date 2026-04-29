---
title: "S3 now supports native state locking... really?"
pubDate: 2026-04-28
tags: ["aws", "s3", "terraform"]
---

AWS and HashiCorp stepped it up and now it's finally time to ditch the DynamoDB table to handle state concurrency. This is officially supported on Terraform 1.11.0 and higher.

Now simply enable versioning on the bucket, then, configure your backend in Terraform to use S3 with native locking enabled.

To enable S3 state locking, use the following optional argument:

- `use_lockfile` Whether to use a lockfile for locking the state file. Defaults to false.

````hcl
terraform {
  required_version = "~> 1.11.0"

  backend "s3" {
    bucket       = "s3-native-lock-setup"
    key          = "backend/terraform.tfstate"
    region       = "eu-north-1"
    profile      = "ProfileForAccount-12345678910"
    use_lockfile = true
  }
}
````

Check out the whole reference at [developer.hashicorp.com](https://developer.hashicorp.com/terraform/language/backend/s3).