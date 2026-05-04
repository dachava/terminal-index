---
title: "echo-mind"
description: "A RAG-powered chatbot that answers questions about my portfolio, built on FastAPI, Lambda, and Claude"
status: "active"
techStack: ["Python", "FastAPI", "AWS", "Terraform", "LangChain", "Anthropic", "Docker"]
repoUrl: "https://github.com/dachava/echo-mind"
startDate: 2026-04-01
featured: false
---

## Overview

echo-mind is a retrieval-augmented generation chatbot that knows about my work. Ask it about a project, a blog post, or anything in my portfolio and it retrieves the relevant content and answers grounded in what's actually there, not what an LLM guesses.

The architecture is a FastAPI app running on AWS Lambda via container image, sitting behind API Gateway and a Cloudflare-managed custom domain. The full stack is provisioned with Terraform.

## Status

The project is being built in four phases. Phases 1 and 1.5 are complete.

| Phase | What | Status |
|-------|------|--------|
| 1 | FastAPI on Lambda, API Gateway, ECR, S3 scaffolding | done |
| 1.5 | Custom domain: Cloudflare DNS + ACM certificate | done |
| 2 | Document ingestion, chunking, embeddings, FAISS index | in progress |
| 3 | RAG chain: retriever + Claude for grounded answers | upcoming |
| 4 | Chat memory, token streaming, frontend integration | upcoming |

## Architecture

```
Browser
  -> Cloudflare DNS (api.dachava.dev)
  -> API Gateway v2 HTTP API
  -> Lambda (container image from ECR)
  -> Mangum (Lambda event to ASGI)
  -> FastAPI
```

At query time (Phase 3 and beyond):

```
user question
  -> embed query (text-embedding-3-small)
  -> FAISS similarity search over portfolio chunks
  -> top-k chunks injected into Claude prompt
  -> grounded answer streamed back
```

## What I Learned Building It

**Phase 1** forced a clear understanding of why Lambda needs an ASGI adapter (Mangum bridges the Lambda event format and FastAPI's HTTP expectations), why container images beat zip files for Python projects with real dependencies, and how Terraform remote state with S3 locking works in practice.

**Phase 1.5** introduced the multi-vendor Terraform problem: coordinating ACM certificate validation across AWS and Cloudflare in a single `terraform apply`. The key insight was using the Cloudflare provider to create the DNS validation record before `aws_acm_certificate_validation` starts polling, eliminating the manual step that makes this workflow painful.

Both phases are documented in detail in the blog posts below.

## Related Posts

- [Running FastAPI on AWS Lambda with Container Images](/blog/fastapi-on-lambda-containers)
- [Automating a Hybrid Cloudflare + AWS Custom Domain with Terraform](/blog/cloudflare-aws-custom-domain-terraform)
- [RAG from First Principles](/blog/rag-foundations)
