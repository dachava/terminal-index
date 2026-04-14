---
title: "crystal-node"
description: "A production-grade Kubernetes platform on AWS powering `chavastyle.com` workloads via EKS, API Gateway, and GitOps."
status: "completed"
techStack: ["Terraform", "AWS", "S3", "Bash"]
repoUrl: "https://github.com/dachava/crystal-node"
startDate: 2026-03-12
featured: true
---

## Overview

crystal-node is a production-pattern AWS platform built on EKS. It is designed to be a shared platform that multiple applications can deploy on without rebuilding infrastructure each time.

Two applications are currently running:

- `api.chavastyle.com`: crystal-app (static site, platform demo)
- `fit.chavastyle.com`: fit-link (FastAPI workout tracker)

Here's a nicely drawn diagram a minion generated for me.

![crystal-node-diagram](/images/crystal-node-arch.png)

## Why???

In my quest for prestigious Cloud Mastery I found out rather quick that I had to get my chops working with real infrastructure. Even if it was a small scale scenario to get a few custom apps running, it had some in-depth design aspects that are worth reviewing.

It's designed to be a reliable, HA platform that stays consistent across deployments. Deploying a new app is just a Kubernetes manifest and an ArgoCD application. Security, networking, and monitoring are already there.

The architecture is loosely coupled so apps run in dedicated namespaces with tight security, no unnecessary exposure. All traffic flows through API Gateway so every cluster resource stays private.

The business value is that onboarding a new service is not an infrastructure project:

### "it's a manifest."

## Architecture

The entire infrastructure is written in Terraform with reusable modules: VPC, EKS, IAM, S3, API Gateway, Route53, observability, security, and CI/CD each live in their own module.

It all starts with the VPC, with public and private subnets across two availability zones, worker nodes live in private subnets and are never directly reachable from the internet.

Traffic flows in through API Gateway using an HTTP API, which connects to the cluster via a VPC Link to an internal Network Load Balancer. The domain `api.chavastyle.com` is managed by Route53 with an ACM certificate for TLS, so everything is HTTPS end to end.

For security I implemented Pod Security Standards at the namespace level, network policies to restrict pod-to-pod traffic, and AWS Secrets Manager for sensitive values. IAM permissions for pods use EKS Pod Identity instead of the legacy IRSA approach which is outdated and a pain in the a$$.

Observability runs on Prometheus and Grafana for real-time metrics and dashboards, with CloudWatch Container Insights shipping logs and metrics to AWS for long-term retention.

For deployments I use GitHub Actions for CI: it builds a Docker image, pushes it to ECR, and updates the image tag in the Kubernetes manifest. 
ArgoCD handles CD: it watches the git repo and syncs the cluster automatically. Git is the single source of truth. Nothing touches the cluster directly.