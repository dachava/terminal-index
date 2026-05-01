---
title: "RAG from First Principles: The Six Concepts You Need Before Writing a Line of Code"
description: "A precise walkthrough of the foundational concepts behind any RAG pipeline, embeddings, cosine similarity, chunking, vector databases, LangChain Documents, and embedding model selection."
pubDate: 2026-04-21
tags: ["rag", "ai", "langchain", "aws", "python"]
draft: false
---

I've been working on a project that involves building a RAG (Retrieval-Augmented Generation) pipeline, a system that retrieves relevant content from a document corpus and uses it to ground an LLM's responses. Before writing a single line of ingestion code, I spent time building the conceptual foundation.

This post documents those six concepts. If you're a DevOps or backend engineer stepping into the AI/ML space, this is the map I wish I'd had ages ago.

---

## 1. What is an embedding?

An embedding is a fixed-length vector of floating-point numbers produced by a neural network. It encodes the **semantic meaning** of text, not its keywords, not its length, but what it's actually about.

The critical property: **similar meaning → nearby points in high-dimensional space**. This is not a metaphor. If you embed "my Lambda function times out" and "my AWS serverless handler is slow", the resulting vectors will be geometrically close. If you embed "my Lambda function times out" and "my cat knocked over a glass", they'll be far apart.

At each layer, the network applies a transformation of the form $h = \sigma(Wx + b)$ — a learned weight matrix $W$, a bias $b$, and a non-linear activation $\sigma$. Stacked across many layers, these operations compress the input into a dense vector that captures meaning rather than surface form.

The intuition comes from word2vec (2013): train a model to predict surrounding words, and it's forced to encode semantic relationships in its weights to do the job well.

The famous result: `king - man + woman ≈ queen` works because *relationships between meanings* are encoded as *directions in vector space*.

Modern sentence embedding models extend this with transformer architectures that encode entire sequences with full context. "I deposited at the bank" and "I fished at the river bank" produce different vectors for "bank" because the surrounding tokens shift the output. Word2vec couldn't do that.

In a RAG pipeline, each chunk of markdown becomes a vector. Those vectors get stored. At query time, the user's question becomes a vector too, and retrieval is just finding the stored vectors nearest to it.

**The key constraint:** embedding models have a context window (e.g. 8,191 tokens for `text-embedding-3-small`). More importantly, embedding an entire long document produces a semantically blurry vector, an average of every concept in the file. That's why we chunk first.

---

## 2. Cosine similarity

You have two vectors. You want to know how similar they are. The naive instinct is Euclidean distance, the straight-line gap between two points. That works for physical distance, temperature, price. It does not work for embeddings.

The problem: embedding magnitude carries no semantic signal. A short summary and the full 2,000-word post it summarizes will point in nearly the same *direction*, same topic and concepts, but the longer text's vector will likely have a larger magnitude. Euclidean distance would call them far apart. That's wrong.

**Cosine similarity** measures the angle between two vectors instead:

$$
\text{cosine\_similarity}(\mathbf{A}, \mathbf{B}) = \frac{\mathbf{A} \cdot \mathbf{B}}{\|\mathbf{A}\| \times \|\mathbf{B}\|}
$$

The division by both magnitudes normalizes each vector to unit length, projecting them onto the surface of a unit sphere. Every vector lives at the same radius. Comparison is purely angular, magnitude is divided out entirely.

This is what "unit-length invariant" means: scaling either vector up or down doesn't change the result. `2A` and `A` point in the same direction, so they have identical cosine similarity with any third vector `B`.

The range is −1 (opposite meaning) to 1 (identical meaning), with 0 meaning orthogonal/unrelated.

**Practical consequence for RAG:** chunks vary wildly in length... a heading might be 20 words, a dense paragraph 300. Cosine similarity puts every chunk on equal footing. Only the direction of meaning competes, not the length of the text.

In FAISS, this translates to using `IndexFlatIP` (inner product) on pre-normalized vectors, which is equivalent to cosine similarity. LangChain's FAISS wrapper handles this normalization by default.

---

## 3. Chunking

You can't embed whole documents. You chunk them first. The core tension:

- **Too large:** the embedding averages over too many concepts, retrieval precision degrades
- **Too small:** each chunk lacks enough context for the embedding to be meaningful

Chunking is the tradeoff between **context** and **precision**.

### The three main strategies

**Fixed-size splitting** cuts every N characters regardless of content structure. Fast and predictable, but semantically blind, it will cut mid-sentence, mid-code-block, mid-thought. The resulting chunks are often incoherent at their edges.

**Sentence-level splitting** splits on punctuation boundaries. Cleaner, but markdown doesn't always follow prose grammar. Code blocks have no sentence boundaries. Bullet lists aren't paragraphs. Individual sentences often lack enough surrounding context for a useful embedding.

**Recursive character splitting** what LangChain's `RecursiveCharacterTextSplitter` implements, is the right choice for markdown. It tries separators in priority order:

`\n\n` → `\n` → `" "` → `individual characters`

It only falls back to a finer separator if the chunk would exceed the size limit at the coarser level. This naturally respects paragraph boundaries, heading sections, and code blocks... the actual structure of the content.

### Chunk overlap

Even with good splitting, a sentence can straddle a boundary. If chunk 4 ends with "...stored in ECR." and chunk 5 starts with "The image size directly affects cold start time...", a query about image size affecting Lambda performance might score poorly against both chunks individually, neither contains the complete thought.

`chunk_overlap` repeats the last N characters of each chunk as the first N characters of the next. It's redundant by design. A `chunk_size` of 500–1000 characters with `chunk_overlap` of 100-200 is a reasonable starting point for technical markdown.

---

## 4. Vector database options

A vector database solves two problems: efficient similarity search at scale, and persistence across restarts. The options make very different tradeoffs.

| Option | Model | Operational overhead | Scale ceiling | Lambda fit |
|---|---|---|---|---|
| **FAISS** | in-memory index, no server | none | millions of vectors | excellent |
| **Chroma** | local server or in-process | low | hundreds of thousands | good |
| **pgvector** | Postgres extension | medium (RDS/Aurora) | hundreds of thousands | good if already on RDS |
| **Pinecone** | managed cloud, serverless | none (vendor-managed) | no practical limit | good, but adds network latency |

### Why FAISS is the right call for a low-traffic serverless RAG

A small corpus... say 20–50 markdown files produces at most a few hundred chunks at 500-character chunk size. FAISS searches that in microseconds.

More importantly, the Lambda deployment model makes FAISS elegant:

- Build the index once during ingestion
- Serialize it to a `.faiss` file, upload to S3
- Lambda downloads it at cold start into `/tmp`, loads it into memory
- Zero additional AWS services, zero network calls per query, zero IAM complexity beyond S3 read access

At 1536 dimensions (OpenAI's embedding size), 500 chunks produces an index of roughly 3MB. Lambda has 512MB of `/tmp` and up to 10GB of memory. This fits trivially.

### Migration triggers

| Signal | Move to |
|---|---|
| Need metadata filtering (blog posts only, not READMEs) | Chroma or pgvector |
| Already running RDS for other features | pgvector (consolidate) |
| Corpus past ~50k chunks, S3 load is slow at cold start | Pinecone or pgvector |
| Concurrent writes during ingestion | Anything but FAISS |
| Real-time index updates without redeploy | Chroma, pgvector, or Pinecone |

None of those apply today. FAISS isn't a compromise, it's the correct tool for this scale and deployment model.

---

## 5. The LangChain Document abstraction

A LangChain `Document` is a container with two fields:

```python
Document(
    page_content="I deployed the Lambda function using a container image stored in ECR...",
    metadata={
        "source": "blog/deploy-lambda.md",
        "chunk_index": 1,
        "content_type": "blog",
        "title": "Deploying Lambda with ECR"
    }
)
```

That's the entire interface. The power is in two things: what you put in `metadata`, and the fact that it **travels with the chunk through every stage**: splitting, embedding, storage, and retrieval.

### What TextSplitter actually does

`RecursiveCharacterTextSplitter` doesn't just cut strings. It takes a `Document` in and returns a list of `Document` objects out. Each child document inherits the parent's metadata automatically. LangChain also adds `start_index` the character offset of that chunk in the original document.

The splitter is a Document factory, not a text utility. The metadata contract is preserved across the split boundary without any manual re-attachment.

### Why metadata matters at retrieval time

This is the non-obvious insight: metadata isn't bookkeeping for your ingestion script. It's operational data that shapes what the system can do at query time.

**Citations.** When the chatbot answers "how did you deploy your Lambda?", you want it to surface `deploy-lambda.md` as the source. That only works if `source` was in the metadata at ingestion and surfaces after retrieval.

**Filtering.** If you later want queries scoped to blog posts only, Chroma and pgvector can filter on `content_type: "blog"`. If you stored it during ingestion, the filter is a one-line change. If you didn't, you re-ingest everything.

**Debugging.** When retrieval returns a bad chunk, metadata tells you exactly where it came from. Without it, you're debugging blind.

### What to store in metadata

Astro frontmatter maps cleanly to metadata:

```python
metadata = {
    "source": relative_path,        # "blog/deploy-lambda.md"
    "chunk_index": i,               # position in parent document
    "content_type": collection,     # "blog" or "projects"
    "title": frontmatter["title"],  # from Astro frontmatter
    "date": frontmatter["date"],    # optional but useful
}
```

Storing this costs nothing at ingestion time and pays dividends at every query.

---

## 6. Embedding model selection

This decision is load-bearing. You cannot mix embedding models in the same index. A vector from `text-embedding-3-small` lives in a different geometric space than one from `all-MiniLM-L6-v2`. Switching models means wiping the index and re-ingesting everything.

### The three options

**OpenAI `text-embedding-3-small`**: API-based, top-tier quality on MTEB benchmarks, 1536 dimensions, $0.02 per million tokens. At portfolio scale (~50k tokens total), ingesting everything costs a fraction of a cent. No model weights in your container. No cold start penalty beyond normal Lambda initialization. The entire operational footprint is one environment variable.

**`all-MiniLM-L6-v2` (sentence-transformers)**: open-source, self-hosted, 384 dimensions, free per-query. The Lambda problem is real: ~90MB of model weights that have to load into RAM at cold start, plus PyTorch as a dependency. That adds 2-4 seconds to every cold start and inflates your container image by several hundred megabytes. The right home for this model is a persistent server, not a serverless function.

**Anthropic**: no dedicated embedding API. Claude is a generation model. For RAG pipelines using Claude as the LLM, the standard pattern is OpenAI or open-source for embeddings, Claude for generation. They're complementary layers, not competing options.

### The call for a Lambda-based RAG

`text-embedding-3-small`. The cost is negligible at small corpus scale. The quality is strong. The Lambda deployment story is clean, no model weights, no cold start penalty, no container image bloat. The migration path is clear: if costs become meaningful at scale or you need offline capability, move to a self-hosted model on a dedicated inference endpoint.

---

## Putting it together

A typical ingestion pipeline for a markdown-based RAG follows directly from these six concepts:

#### Ingestion

```python
for each .md file in your content directory:
    read frontmatter + body
    wrap in Document(page_content=body, metadata={source, type, title, ...})
    split via RecursiveCharacterTextSplitter  # → list of Documents
    embed each chunk via text-embedding-3-small  # → 1536-dim vector
    add to FAISS index with metadata preserved

serialize index  # → upload to S3
```

#### Query

```python
embed user query  # → 1536-dim vector (same model, same space)
load FAISS index from S3
search for top-k nearest vectors  # cosine similarity
retrieve Documents with metadata intact
inject chunk text into LLM prompt as context
return grounded answer with source citations
```

Each decision traces back to a concept: the model choice (topic 6) determines the vector space, chunking (topic 3) determines retrieval precision, cosine similarity (topic 2) determines the ranking, the Document abstraction (topic 5) preserves provenance, and FAISS (topic 4) makes it all searchable without additional infrastructure.

---

*More on the specific project I'm applying this to in a future post.*

> "The question of whether machines can think is about as relevant as the question of whether submarines can swim." 
>
> — Edsger Dijkstra