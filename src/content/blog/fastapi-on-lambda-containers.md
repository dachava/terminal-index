---
title: "Running FastAPI on AWS Lambda with Container Images"
description: "Lambda doesn't speak HTTP. FastAPI doesn't speak Lambda events. Here's how Mangum bridges the gap, why container images beat zip files for real projects, and the Docker gotcha that will silently break your deploy."
pubDate: 2026-05-01
tags: ["aws", "lambda", "fastapi", "python", "docker", "devops"]
draft: false
---

Lambda doesn't speak HTTP. It speaks events: JSON blobs that come in → JSON blobs that go out. 

FastAPI, on the other hand, is an ASGI framework built around HTTP requests and responses.

These two things should not work together. But they do, and the result is surprisingly good.

---

## Why Lambda in the first place?

Before the how, the why.

Lambda's value proposition for an API backend is straightforward: **you pay for exactly what runs.** No idle EC2 instance burning money at 3am. Stop wasting cash and compute. A Lambda function costs nothing when it's not being called, and scales automatically when it is.

For a portfolio project or early-stage product, this is hard to beat. The free tier covers 1 million requests and 400,000 GB-seconds of compute per month. Most personal projects never leave it.

The tradeoff is cold starts, the latency hit when Lambda has to spin up a new container from scratch. More on that later.

---

## The ASGI problem

Lambda's event model looks like this:

```python
def handler(event, context):
    # event = {"httpMethod": "GET", "path": "/health", "headers": {...}, ...}
    return {
        "statusCode": 200,
        "body": "ok"
    }
```

FastAPI (and any ASGI framework) expects to be called like this:

```python
async def app(scope, receive, send):
    # scope = {"type": "http", "method": "GET", "path": "/health", ...}
    ...
```

These are completely different interfaces. Normally you'd run FastAPI behind Uvicorn, which handles the HTTP layer. But Lambda doesn't give you a server, it gives you function calls.

Enter **Mangum**.

---

## Mangum: the one-line fix

Mangum is an ASGI adapter for Lambda. It translates the Lambda event format into something ASGI frameworks understand, and converts their response back into what Lambda expects.

The entire integration is one line:

```python
from fastapi import FastAPI
from mangum import Mangum

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

handler = Mangum(app)
```

It's beautiful. `handler` is now a valid Lambda handler. Mangum handles API Gateway v2 (HTTP API), API Gateway v1 (REST API), ALB, and Function URLs. It detects the event type automatically.

---

## Container images vs zip files

Lambda supports two deployment formats: zip files and container images. Most tutorials reach for zip. I chose containers, and it was the right call.

**Zip deployments** have a 250 MB unzipped size limit. For a Python project with heavy dependencies (anything ML-adjacent, anything with binary wheels), you'll hit this quickly. Working around it means Lambda Layers, which adds complexity.

**Container images** support up to 10 GB. You get a real Dockerfile, a real build process, and your dependencies are just... installed normally. No layers, no size gymnastics.

The Dockerfile is straightforward:

```dockerfile
FROM public.ecr.aws/lambda/python:3.12

WORKDIR /var/task

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

CMD ["app.main.handler"]
```

Lambda's Python base images come with the Lambda Runtime Interface Client pre-installed, so there's nothing special to set up. Build it, push it to ECR, point Lambda at it.

---

## The Docker gotcha that will silently break you

Modern Docker Desktop enables BuildKit by default. BuildKit is good, it's faster and supports cache mounts. But it also adds **provenance attestations** to images by default, producing an OCI image manifest.

Lambda doesn't support OCI manifests. It only accepts Docker manifest v2 schema 2.

The failure mode is subtle. Your `docker push` succeeds. Your ECR image looks fine. But when Lambda tries to pull it, you get a cryptic `ResourceNotFoundException` or a silent failure during deployment.

The fix is one flag:

```bash
docker build --provenance=false -t my-image .
```

This tells BuildKit not to attach provenance attestations, producing a standard Docker manifest that Lambda accepts.

---

## Cold starts

Cold starts are Lambda's most discussed drawback. Here's what they actually look like for a containerized FastAPI app:

- **Warm invocation**: 10–50ms. Negligible.
- **Cold start (small image, minimal deps)**: 500ms–1s.
- **Cold start (large image, heavy deps)**: 2–5s.

For an API that serves interactive traffic, occasional cold starts are acceptable. For a user-facing endpoint that needs sub-100ms p99 latency under all conditions, Lambda is the wrong choice.

A few things that help:
- Keep your image small. Every MB you add is cold start time.
- Use **provisioned concurrency** if you need guaranteed warm instances (costs money).
- Lambda **SnapStart** exists for Java; Python doesn't have an equivalent yet.

For my use case (chatbot that gets intermittent traffic), cold starts aren't a problem. The first request after a quiet period might take a second longer. But no one cares except me, and I really don't.

---

## The full picture

Here's the complete stack, from browser to function:

```
Browser
  → Cloudflare DNS (CNAME to API Gateway)
  → API Gateway v2 HTTP API
  → Lambda (container image from ECR)
  → Mangum (event → ASGI translation)
  → FastAPI (route handling)
  → response back up the chain
```

Infrastructure managed entirely by Terraform. A single `terraform apply` provisions the ECR repository, Lambda function, API Gateway, and IAM roles. A deploy script builds the container, pushes to ECR, and updates the Lambda function code.

FastAPI's automatic OpenAPI docs (`/docs`) work out of the box. Health checks, middleware, dependency injection... everything that makes FastAPI worth using works exactly as it does locally. Mangum is invisible once it's in place.

---

## Worth it?

**Hell Yeah!** The combination of FastAPI's DX, Lambda's cost model, and container images' flexibility is genuinely good. You write a normal FastAPI app, add one line for Mangum, and you get a serverless API that scales to zero and costs nothing at rest.

The rough edges are real: cold starts, the Docker manifest issue, container push times during development.But none of them are dealbreakers, they're just the tax you pay for infrastructure that largely runs itself.

For a greenfield project with variable traffic and a tight budget: **this stack is worth it.**
