# Lesson 5.3: Caching Strategies

**Module**: 5 — Cost Management and Optimization
**Estimated reading time**: ~20 minutes
**Level**: Intermediate

---

## Overview

Caching is the most reliable way to reduce agent costs. If you've already computed a result, you shouldn't pay to compute it again. This lesson covers three caching levels available to agentic systems: provider-level prompt caching, response caching, and semantic deduplication.

---

## Level 1: Provider-Level Prompt Caching

Provider-level prompt caching (discussed in Lesson 5.1) works by caching the key-value attention states of stable input prefixes. When the same prefix is used again, the provider skips recomputing attention for the cached portion.

### What to cache at the provider level

**System prompts**: Every request sends the system prompt. For a 2,000-token system prompt used 10,000 times per day, caching reduces that to ~200 tokens (10% of cached price) for 9,999 of those requests.

**Long static documents**: If multiple agents process the same document (e.g., all agents in a research pipeline work on the same 10,000-token policy document), cache the document and pay full price only once per session.

**Tool schemas**: Large tool schema definitions don't change between requests. Cache them.

### Caching structure: stable prefix first

Provider caching caches the *prefix* — the beginning of the input. Structure your messages with the most stable content first:

```
1. System prompt (static, cache this)
2. Long context documents (stable within a session, cache these)
3. Tool schemas (static, cache these)
4. Conversation history (changes per turn — not cached)
5. New user message (always new — not cached)
```

```python
def build_cacheable_messages(
    system_prompt: str,
    context_documents: list[str],
    tool_schemas: list[dict],
    conversation: list[Message],
    new_message: str
) -> list[dict]:
    messages = []

    # 1. Cached system prompt
    messages.append({
        "role": "user",
        "content": [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"}  # Request caching
            }
        ]
    })

    # 2. Cached context documents
    if context_documents:
        doc_text = "\n\n".join(context_documents)
        messages.append({
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": f"<context>{doc_text}</context>",
                    "cache_control": {"type": "ephemeral"}
                }
            ]
        })

    # 3. Non-cached conversation history
    messages.extend(conversation)

    # 4. Non-cached new message
    messages.append({"role": "user", "content": new_message})

    return messages
```

---

## Level 2: Response Caching

Response caching stores complete agent outputs and returns them for identical (or near-identical) future inputs.

### When to use response caching

- **Deterministic queries**: "What is the capital of France?" always has the same answer. Cache it.
- **Semi-stable queries**: "What is the current Q1 2026 company policy on remote work?" The answer doesn't change intra-day. Cache with a TTL.
- **Expensive computations**: A competitive analysis that took $2 to produce can be served from cache for days.

### Cache key design

The cache key should uniquely identify the input. For agent tasks:

```python
def compute_cache_key(task: Task) -> str:
    """
    Compute a cache key for a task.
    Must capture everything that affects the output.
    """
    key_components = {
        "task_type": task.type,
        "input_content": task.input,
        "context_hash": hash_context(task.context),  # Hash of relevant context
        "agent_version": AGENT_VERSION,               # Different agent = different result
        "model": task.model,                          # Different model = different result
    }

    # Do NOT include:
    # - task_id (different ID, same content = same result)
    # - timestamp (unless the task is time-sensitive)
    # - session_id (unless the task is session-specific)

    return hashlib.sha256(
        json.dumps(key_components, sort_keys=True).encode()
    ).hexdigest()
```

### Cache with TTL

```python
class AgentResponseCache:
    def __init__(self, store: CacheStore):
        self.store = store

    async def get(self, cache_key: str) -> CachedResult | None:
        return await self.store.get(cache_key)

    async def set(
        self,
        cache_key: str,
        result: TaskResult,
        ttl_seconds: int
    ) -> None:
        cached = CachedResult(
            result=result,
            cached_at=datetime.utcnow().isoformat(),
            cache_key=cache_key,
            expires_at=(datetime.utcnow() + timedelta(seconds=ttl_seconds)).isoformat()
        )
        await self.store.set(cache_key, cached, ttl=ttl_seconds)

    async def execute_with_cache(
        self,
        agent: Agent,
        task: Task,
        ttl_seconds: int = 3600
    ) -> TaskResult:
        cache_key = compute_cache_key(task)

        # Check cache first
        cached = await self.get(cache_key)
        if cached:
            return TaskResult(
                **cached.result.__dict__,
                from_cache=True,
                cached_at=cached.cached_at
            )

        # Cache miss — execute and cache
        result = await agent.execute(task)

        if result.success:  # Don't cache failures
            await self.set(cache_key, result, ttl_seconds)

        return result
```

### TTL selection

| Task type | Recommended TTL | Why |
|-----------|----------------|-----|
| Static reference queries | 7 days | Answer rarely changes |
| Daily operational queries | 4 hours | Updated at most daily |
| Current events / real-time | 5 minutes or no cache | Information changes rapidly |
| User-specific queries | Session duration | Different users, different answers |
| Expensive analysis | 24 hours | High cost to recompute |

---

## Level 3: Semantic Deduplication

Semantic deduplication identifies queries that are *semantically similar* (not just identical) and returns cached results for them.

**Example**: These three queries are textually different but semantically equivalent:
- "What are Acme's Q1 2026 revenue figures?"
- "Tell me Acme Corp's revenue for the first quarter of 2026"
- "Acme Corporation Q1 2026 earnings?"

Exact-match caching returns a miss for all three. Semantic caching returns a hit for the second and third using the first's cached result.

```python
class SemanticCache:
    def __init__(self, embedding_model, vector_store, similarity_threshold: float = 0.92):
        self.embedder = embedding_model
        self.vector_store = vector_store
        self.threshold = similarity_threshold

    async def lookup(self, query: str) -> CachedResult | None:
        # Embed the incoming query
        query_embedding = await self.embedder.embed(query)

        # Search for similar queries in the cache
        results = await self.vector_store.search(
            embedding=query_embedding,
            k=1,  # Get the closest match
            min_similarity=self.threshold
        )

        if not results:
            return None

        closest_match, similarity = results[0]

        # Log for monitoring (track cache hit rates and similarity distribution)
        self.logger.info(
            "semantic_cache.hit",
            similarity=similarity,
            original_query=query[:100],
            cached_query=closest_match.query[:100]
        )

        return closest_match.cached_result

    async def store(self, query: str, result: TaskResult, ttl_seconds: int) -> None:
        embedding = await self.embedder.embed(query)
        await self.vector_store.upsert(
            key=compute_cache_key_from_embedding(embedding),
            query=query,
            embedding=embedding,
            result=result,
            ttl=ttl_seconds
        )
```

### Semantic cache risks

**False positives**: Two queries that look similar but expect different answers. "What are Acme's Q1 2026 revenues?" and "What are Globex's Q1 2026 revenues?" have high semantic similarity but completely different answers.

**Mitigation**: Set a high similarity threshold (0.92+). Include entity names and specific terms in your cache key extraction. Always sanity-check cached results against the original query context.

```python
def validate_semantic_match(original_query: str, cached_query: str, similarity: float) -> bool:
    """Verify the semantic match is actually equivalent."""

    # Extract key entities from both queries
    original_entities = extract_named_entities(original_query)
    cached_entities = extract_named_entities(cached_query)

    # If entities differ, this isn't a valid cache hit regardless of similarity
    if original_entities != cached_entities:
        return False

    # High similarity AND matching entities = valid hit
    return similarity >= SEMANTIC_CACHE_THRESHOLD
```

---

## Combining Cache Levels

Production cache systems typically combine all three levels:

```python
class MultiLevelCache:
    def __init__(self, response_cache: AgentResponseCache, semantic_cache: SemanticCache):
        self.response_cache = response_cache
        self.semantic_cache = semantic_cache

    async def lookup(self, task: Task) -> TaskResult | None:
        # Level 1: Exact cache key match (fastest, most reliable)
        cache_key = compute_cache_key(task)
        exact_hit = await self.response_cache.get(cache_key)
        if exact_hit:
            return exact_hit.result

        # Level 2: Semantic similarity match (slower, less reliable)
        semantic_hit = await self.semantic_cache.lookup(task.input)
        if semantic_hit and validate_semantic_match(task.input, semantic_hit.original_query, semantic_hit.similarity):
            return semantic_hit.result

        return None  # Cache miss — execute the task

    async def store(self, task: Task, result: TaskResult) -> None:
        cache_key = compute_cache_key(task)
        ttl = select_ttl(task.type)

        # Store in both caches
        await self.response_cache.set(cache_key, result, ttl)
        await self.semantic_cache.store(task.input, result, ttl)
```

---

## Measuring Cache Effectiveness

Track these metrics to understand and improve your cache:

```python
cache_metrics = {
    "exact_hit_rate": exact_hits / total_requests,
    "semantic_hit_rate": semantic_hits / total_requests,
    "total_hit_rate": (exact_hits + semantic_hits) / total_requests,
    "cost_savings_usd": cache_hits * avg_cost_per_task,
    "avg_cache_ttl_remaining": avg(result.ttl_remaining for result in cache_hits),
    "false_positive_rate": semantic_false_positives / semantic_hits  # Requires human validation sample
}
```

A well-tuned cache should have a hit rate of 30-60% for typical workloads. Below 10% suggests too few repeated queries or cache TTLs that are too short. Above 80% suggests very repetitive workloads where the cache is highly effective.

---

## Summary

- Three caching levels: provider-level prompt caching (cheapest, automatic), response caching (exact match), semantic deduplication (near-match)
- Provider caching: structure messages with stable content first (system prompt, documents, tool schemas before conversation)
- Response caching: cache key must include everything that affects output — task type, content, agent version, model
- TTL selection: 7 days for static reference, 4 hours for operational, 5 minutes for real-time, session for user-specific
- Semantic deduplication: use high similarity threshold (0.92+) and validate entity matches to prevent false positives
- Combine all three levels in production; measure hit rate, cost savings, and false positive rate

---

*Next: [Lesson 5.4 — Model Selection and Prompt Optimization](04-model-selection.md)*
