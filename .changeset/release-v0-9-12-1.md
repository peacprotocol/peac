---
'@peac/core': minor
'@peac/crawler': minor
'@peac/receipts': minor
'@peac/aipref': minor
'@peac/pay402': minor
'@peac/disc': minor
'@peac/sdk-js': minor
'@peac/adapter-mcp': minor
'@peac/adapter-openai': minor
'@peac/adapter-langchain': minor
'@peac/adapter-cloudflare': minor
---

PEAC v0.9.12.1: Clean architecture, neutral crawler, protocol v1.1 ready

This release delivers a comprehensive repository refactor to a clean single-root monorepo with enhanced protocol features:

**🏗️ Clean Architecture**

- Single workspace root with apps/ + packages/ structure
- Legacy packages archived to legacy/v0.9.11 branch
- Adapters organized under packages/adapters/\*
- Zero hybrid or transitional structure

**🕷️ Neutral Crawler Control**

- Vendor-agnostic registry with circuit breakers
- Graceful degradation patterns
- Zero-config setup with sensible defaults
- Performance SLOs: ≤35ms verification with Cloudflare enabled

**📋 Enhanced JSON Schemas**

- receipt@1.1, discovery@1.1, purge@1.0 with verification/security fields
- CBOR compact profiles for 60-70% size reduction
- Canonical schemas/ and profiles/ directories

**🤖 Agent Integration Ecosystem**

- MCP stdio server for Claude and compatible agents
- OpenAI functions format support
- LangChain tools integration
- Cloudflare Worker edge deployment ready

**⚡ Performance & Standards**

- Sign p95≤3ms, verify p95≤1ms performance targets
- RFC compliance with proper error handling
- Enterprise-ready CI/CD with 7-phase validation
- Zero legacy debt with strict dependency boundaries

**🔒 Security & Compliance**

- Zero vulnerabilities detected
- SLSA provenance and NPM package signing
- Comprehensive SBOM generation
- Automated security scanning

This is a production-ready release suitable for enterprise deployments with AI workloads.
