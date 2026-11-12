# Skin Assessment

## Purpose

The skin assessment is the user's self-reported cosmetic context. It is not a
medical questionnaire and must not be used for diagnosis or treatment advice.

## Current API

- `GET /skin-assessments/current` returns the authenticated user's current
  assessment, or `null` when they have not completed it.
- `PUT /skin-assessments/current` creates or replaces the authenticated user's
  current assessment. The request never accepts a user ID.

The version-one answer contract is:

```json
{
  "answers": {
    "skinType": "COMBINATION",
    "sensitivity": "NOT_SURE",
    "concerns": ["ACNE", "OILINESS"],
    "goals": ["REDUCE_ACNE", "OIL_CONTROL"]
  }
}
```

`NONE` is allowed as the only concern, but cannot be combined with a specific
concern. Each saved record is tagged `skin-assessment-v1` so future question
changes can be interpreted safely.

## Persistence boundary

The current assessment is stored once per user in
`app_skin_analysis.user_assessments`. It is distinct from
`assessment_snapshots`, which will store an immutable copy associated with a
specific skin-analysis session when those workflows are connected.

## Product gaps

- The questionnaire does not yet record explicit consent/version for using
  self-reported answers to generate AI routine recommendations.
- A routine draft must identify which assessment version and analysis session
  produced it, so later assessment edits do not silently change its rationale.
- Define how users can correct or delete answers and how that affects active
  routine recommendations and derived records.
