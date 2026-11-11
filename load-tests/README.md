# Load tests

Install k6 separately, then run only against a disposable test environment:

```sh
k6 run -e BASE_URL=http://localhost:3000 -e ACCESS_TOKEN=<test-token> load-tests/smoke.js
```

This smoke suite deliberately does not call Gemini or create analyses, so it
cannot consume production quota. Record the k6 summary, container CPU/memory,
and database `EXPLAIN (ANALYZE, BUFFERS)` output in a dated report before adding
any Before/After portfolio figures. No performance figures are claimed here.
