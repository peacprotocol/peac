# Flow Diagrams

```mermaid
sequenceDiagram
  participant Agent
  participant Publisher
  Agent->>Publisher: GET /pricing.txt
  Publisher-->>Agent: YAML terms
  Agent->>Agent: signRequest()
  Agent->>Publisher: Request + Signature Headers
  Publisher-->>Agent: HTTP 200 or 402
  
  ```
  
### .github/workflows/validate.yml
```yaml
name: Validate Schema

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm install -g ajv-cli js-yaml
      - run: |
          for file in examples/*.yaml examples/*.txt; do
            npx js-yaml "$file" > /tmp/tmp.json
            npx ajv-cli validate -s pricing.schema.json -d /tmp/tmp.json
          done