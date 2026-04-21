---
title: "ghostlink.lol"
description: "A production style URL shortener platform on AWS live at `ghostlink.lol` using via ECS Fargate, Lambda, RDS, and CI/CD."
status: "active"
techStack: ["Terraform", "AWS", "ECS", "Lambda", "RDS", "FastAPI"]
repoUrl: "https://github.com/dachava/phantom-link"
liveUrl: "https://ghostlink.lol"
startDate: 2026-04-20
featured: true
---

## Overview

A production-style URL shortener built phase by phase on AWS, live at [ghostlink.lol](https://ghostlink.lol).

The system handles the full lifecycle once an URL is triggered:

**create a short link 🡢 redirect 🡢 count the click 🡢 expose stats 🡢 protect endpoint 🡢 observe the system** 

The application itself is a small FastAPI, that's not really the important part. My true goal was to build the whole infrastructure brick by brick, so proper IaC, CI/CD and important design decisions.

Terraform was used to provision as usual, for now it's my tool of choice due to its ease to set up and manage state from AWS iself.

## Architecture

### Creating a short link

A user submits a URL through the frontend or directly via `POST /create`. The request hits API Gateway, which proxies it to a Python Lambda. 

The Lambda fetches database credentials from Secrets Manager on cold start (cached in the module-level scope afterward), generates an 8-character URL-safe code, and inserts the mapping into RDS Postgres via the RDS Proxy.

The short URL is returned to the caller.

The RDS Proxy sits between the Lambda and Postgres to solve a specific Lambda problem: 

**Every cold start opens a new database connection.**

At high concurrency this exhausts Postgres `max_connections` (~80 on a `db.t3.micro`). The proxy
maintains a persistent pool of those 80 connections and multiplexes thousands
of Lambda invocations across them.

### Following a short link

`GET /{code}` enters through CloudFront, which runs it through a WAF WebACL before forwarding it to the ALB. 

The ALB routes to a FastAPI app running on ECS Fargate. 
Fargate looks up the code in Postgres (also via the RDS Proxy), writes a click event JSON object to S3, and returns a 302 redirect to the original URL.

The click write happens synchronously before the redirect... a deliberate trade-off for dev simplicity. 

In production this would be fire-and-forget
(async write or SQS enqueue) to keep the redirect path as fast as possible.

### Count the click

The S3 write triggers an event notification to a processor Lambda. The processor reads the click JSON, extracts the short code, and performs an atomic `ADD` increment on the `click_count` attribute in DynamoDB. 

The `ADD` operation is server-side and atomic, no read-modify-write, no race condition under concurrent clicks.

If the processor fails after all retries (2 retries = 3 total attempts), the event is forwarded to an SQS dead-letter queue with a full error envelope. The click is not lost, it sits in the DLQ for 14 days waiting to be redriven once the root cause is fixed.

### The Frontend

I applied the K.I.S.S. methodology, so the frontend is a single HTML stored in S3.
CloudFront serves it with two ordered cache behaviors: `/` and `/index.html` route to S3, everything else
routes to the ALB. 

A CloudFront Function rewrites `/` to `/index.html` because `default_root_object` only applies to the default cache behavior, not ordered ones, a subtle AWS behavior that caused a 403 in early testing.

The API Gateway endpoint is injected into `index.html` at deploy time via `sed`.

The HTML contains a `__API_ENDPOINT__` placeholder that the deploy script replaces with the live Terraform output before syncing to S3.

### Stats

`GET /{code}/stats` hits the same API Gateway and Lambda as the create path.

The handler queries Postgres for the URL and creation timestamp, queries DynamoDB for the click count, and returns the merged result. The frontend shows click counts per link and re-fetches them on page load from `localStorage`.