# Piasnews History Knowledge Base

Use this file when maintaining `data/history.json`, reviewing historical labels, configuring retrieval, or deciding whether to show the fan-daily `Looking Back` / `往日回顾` section.

## Purpose

Historical context is optional fan value, not filler. The knowledge base should contain career-defining results, decisions, controversies, social moments, and other events that remain recognizable to fans. Ordinary interviews and routine announcements should not enter merely because they are official.

Historical retrieval is separate from latest-news collection and must not expand live news searches beyond the latest 3 days.

The maintained sources of truth are:

- Approved events: `data/history.json`
- Candidate queue and review decisions: `data/history-candidates.json`
- Retrieval configuration: `references/history-retrieval.json`
- Pages endpoint: https://znonymity.github.io/piasnews/data/history.json
- Raw fallback: https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history.json

## Review workflow

1. `scripts/build_history_candidates.py` nominates conservative candidates from recent verified news metadata without using an LLM.
2. Store pending, approved, and rejected review records in `data/history-candidates.json` so rejected items are not nominated repeatedly.
3. The static review console lets the maintainer correct facts, assign all five scores, edit precise semantic fields, and approve or reject.
4. The stateless review Worker authenticates the request and dispatches `.github/workflows/review-history.yml`; it does not write repository files directly.
5. `scripts/review_history.py` applies the decision. Approval copies the reviewed event into `data/history.json`; rejection remains in the candidate audit queue only.
6. Run `python3 scripts/validate_history.py` before committing or publishing.

`data/history.json` contains approved events only. Pending and rejected candidates must not appear in a fan daily.

## Selection signals

Use a 0-100 scale:

| Field | Meaning |
| --- | --- |
| `historical_value` | Overall value for future fan recall. This is the final display gate. |
| `peak_attention` | How much attention the event received when it happened. |
| `lasting_significance` | Whether fans and later coverage continue to reference it. |
| `career_impact` | How strongly it changed Piastri's career or competitive record. |
| `fan_recognition` | Whether fans can recognize the event without lengthy setup. |

Do not compare raw likes or views across years and platforms. Use engagement only as one signal alongside reputable coverage volume, later references, competitive significance, and human judgment.

The default display threshold is `historical_value >= 70`. A content type is never an automatic inclusion or exclusion: an ordinary interview may be rejected, while an iconic official social post may qualify.

## Semantic fields

Use structured facets to prevent broad, misleading matches:

- `event_kind`: race result, Sprint result, official social statement, contract ruling, and similar event forms.
- `themes`: precise concepts such as first Grand Prix win, team orders, or contract dispute.
- `round`, `circuit`, and `session`: exact sporting context when applicable.
- `outcome`: the concrete result or consequence.
- `strong_keys`: normalized high-precision identifiers used as a contextual-match gate.
- `embedding_text`: a self-contained factual sentence for optional future embedding generation.

Broad context such as `Formula 1`, `McLaren`, `race`, or `street circuit` is not enough to establish a contextual connection.

## Looking Back retrieval

Use one merged section with at most one item:

1. Build anniversary candidates from exact `month_day` matches.
2. Build contextual candidates only when the current main news and a historical event share at least one exact strong facet. If embeddings are enabled later, vector similarity is an additional signal, not a replacement for this gate.
3. Keep only approved events with `include: true` and `historical_value >= 70`.
4. Rank eligible candidates according to `references/history-retrieval.json`.
5. Omit the section when there is no meaningful candidate.

An anniversary item does not need to pretend it is related to today's news. A contextual item must state the specific connection. Historical importance cannot rescue weak relevance.

## Pretrained model policy

No embedding model is required for the current knowledge base. When semantic vectors are enabled:

- Record the model ID, immutable revision, dimensions, license, and artifact checksum in GitHub.
- Small generated embeddings may be committed as `data/history.embeddings.json`.
- Do not commit large model weights to the repository. Use a GitHub Release or a model registry and keep a deterministic download reference in the config.
- Preserve the structured-facet fallback so installations without the model still work.

### How a configured model is called

The configuration file is a manifest, not an executable model call. A future `scripts/build_history_embeddings.py` or equivalent runtime must read it and perform these steps:

1. Resolve `model_id` at the immutable `model_revision`.
2. Download or restore the matching tokenizer and weights, then verify the recorded license and checksum.
3. Embed each approved event's `semantic.embedding_text` and publish vectors with the same model metadata.
4. Embed the current-news query with the same model.
5. Retrieve by vector similarity, then apply exact strong-facet gates and ranking weights. Vector similarity alone never authorizes a contextual match.

For fan agents that should consume no Piasnews token, prefer CI mode: GitHub Actions runs an open-weight model, publishes vectors or resolved history links, and agents read the static result. Local-agent mode is optional and requires that user's environment to download and run the same model.

### Release versus model repository

- A GitHub Release is a versioned set of downloadable files attached to a repository tag. It is suitable for a small self-contained model artifact, vector index, checksum file, or one-off experimental build.
- A model repository is a dedicated model host such as Hugging Face Hub or another Git-LFS-backed registry. It stores weights, tokenizer files, configuration, model card, license, and immutable revisions in a format model runtimes can load directly.

Use the normal Piasnews Git repository for code, labels, tests, model metadata, and small indexes. Prefer a model repository for a trained embedding model or reranker; use a GitHub Release when the artifact is small and simple enough that model-registry features add little value.

## Post-training roadmap

Do not train a base model from scratch. Build supervision from human review in stages:

1. Collect event-level inclusion scores and approval decisions in `data/history-candidates.json`; keep approved serving data in `data/history.json`.
2. After contextual retrieval is used, collect query-event pairs with `relevant`, `relation_type`, matched strong facets, and a short rejection reason.
3. Preserve hard negatives, such as two street-circuit events that share broad context but differ in circuit, session, outcome, and historical meaning.
4. Tune gates, thresholds, and ranking weights before changing any model.
5. If labeled pairs become large enough, train a small learning-to-rank or cross-encoder reranker first. Fine-tune the bi-encoder with contrastive positive/hard-negative pairs only when retrieval recall itself is the demonstrated bottleneck.

Keep training data, code, evaluation splits, metrics, and model metadata in GitHub. Store large trained weights outside normal Git history and reference them immutably from `references/history-retrieval.json`.

## Event schema

See `data/history-candidates.json` for pending and reviewed examples, and `data/history.json` for approved serving data. The important review and retrieval fields are:

```json
{
  "selection": {
    "review_status": "pending",
    "include": null,
    "historical_value": null,
    "peak_attention": null,
    "lasting_significance": null,
    "career_impact": null,
    "fan_recognition": null,
    "inclusion_reason": "Why this candidate may matter"
  },
  "semantic": {
    "event_kind": "race_result",
    "themes": ["first Grand Prix win", "team orders"],
    "round": "Hungarian Grand Prix",
    "circuit": "Hungaroring",
    "session": "race",
    "outcome": "first Formula 1 Grand Prix victory",
    "strong_keys": ["first_grand_prix_win", "hungarian_grand_prix", "team_orders"],
    "embedding_text": "A self-contained factual sentence."
  }
}
```

## Source and maintenance rules

- Prefer Oscar Piastri, Formula 1, McLaren, FIA, official championship sites, and official results.
- Use Wikipedia, fan posts, and archives only to discover candidates, not as sole evidence.
- Store metadata, short summaries, and links rather than full articles or threads.
- Use exact event dates. If the date is uncertain, do not add the event.
- Use stable IDs in the form `piastri-YYYY-MM-DD-short-slug`.
- Suggested `type` values include `race_win`, `career_milestone`, `career_turning_point`, `contract`, `team`, `social_moment`, and `other`.
