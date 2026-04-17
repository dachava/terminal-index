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

The business value is that onboarding a new service is not an infrastructure project... it's a manifest.

## Architecture

The entire infrastructure is written in Terraform with reusable modules: VPC, EKS, IAM, S3, API Gateway, Route53, observability, security, and CI/CD each live in their own module.

It all starts with the VPC, with public and private subnets across two availability zones, worker nodes live in private subnets and are never directly reachable from the internet.

Traffic flows in through API Gateway using an HTTP API, which connects to the cluster via a VPC Link to an internal Network Load Balancer. The domain `api.chavastyle.com` is managed by Route53 with an ACM certificate for TLS, so everything is HTTPS end to end.

For security I implemented Pod Security Standards at the namespace level, network policies to restrict pod-to-pod traffic, and AWS Secrets Manager for sensitive values. IAM permissions for pods use EKS Pod Identity instead of the legacy IRSA approach.

Observability runs on Prometheus and Grafana for real-time metrics and dashboards, with CloudWatch Container Insights shipping logs and metrics to AWS for long-term retention.

## Deploying apps
Pushing to master triggers a GitHub Actions workflow. The workflow uses OIDC federation to assume an AWS IAM role. GitHub generates a short-lived token, exchanges it with AWS STS for temporary credentials scoped to just what the pipeline needs.

The workflow builds a Docker image, tags it with the git commit SHA for traceability, and pushes it to ECR. Then it updates the image tag in `k8s/crystal-app/app.yaml` in the repo and pushes that commit back to git.

ArgoCD is watching the repo in a sync loop. It detects the new commit, pulls the updated manifest, and applies it to the cluster. Kubernetes performs a rolling update: new pods come up with the new image before old ones are terminated, so there's no downtime.

ArgoCD's `selfHeal` setting means if anyone manually changes something in the cluster, ArgoCD detects the drift and reverts it.

## New microservice onboarding
Onboarding a new service means four things. 
1. Kubernetes manifests in a dedicated directory: k8s/service-name/deployment.yaml with the deployment, service, and any other resources.

2. An ArgoCD Application pointing at that directory: ArgoCD watches it and deploys automatically whenever the manifests change.

3. A dedicated namespace with our standard security policies applied: network policies and Pod Security Standards are already defined, just apply them to the new namespace.

4. An ECR repository for their images and a GitHub Actions workflow that builds, pushes, and updates the image tag in the manifest.

The platform infrastructure VPC, EKS, networking, monitoring, etc., is shared and already running. A new service is maybe two hours of work to onboard. That's the value of building a platform instead of one-off infrastructure.

## Scaling

- Pod scaling via HPA (Horizontal):  when CPU or memory hits a threshold, Kubernetes adds more pod replicas in seconds.
- Node scaling via Cluster Autoscaler: when there's no capacity to schedule new pods, it provisions new EC2 nodes. The NLB automatically distributes traffic across all healthy pods.

The two layers work together, HPA responds to load first, Cluster Autoscaler backs it up when pod density exceeds node capacity.

## IRSA vs. EKS Pod Identity
IRSA uses OIDC federation: the pod presents a token to STS which validates it against an OIDC provider registered in IAM. It works but it's a mess... you manage an OIDC provider, a thumbprint that can expire or mismatch, and complex trust policy conditions.

In fact, one of the darkest debugging sessions for this project was caused by IRSA. At one point I kept getting 403 on AssumeRoleWithWebIdentity that traced back to the OIDC thumbprint after cluster recreation.

Pod Identity is the modern replacement. Instead of the pod talking directly to STS, a Pod Identity Agent running on each node intercepts credential requests and exchanges them with the EKS API. No OIDC provider, no thumbprint, simpler trust policy.

## What's next?
For this project, probably nothing. I need to work on a FastAPI app I'm developing to keep track of my workouts and is already onboarded here, however the cost of keeping the cluser alive for such a simple app is a waste of resources. Still I will use it as a great reference and will post some other knowledge acquired from this project.

In the near future I will build a new infra that leverages other AWS services like Bedrock and partake in such side activities...