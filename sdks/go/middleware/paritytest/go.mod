module github.com/peacprotocol/peac/sdks/go/middleware/paritytest

go 1.26

require (
	github.com/peacprotocol/peac/sdks/go v0.9.29
	github.com/peacprotocol/peac/sdks/go/middleware/chi v0.0.0
	github.com/peacprotocol/peac/sdks/go/middleware/echo v0.0.0
	github.com/peacprotocol/peac/sdks/go/middleware/nethttp v0.0.0
)

replace (
	github.com/peacprotocol/peac/sdks/go => ../..
	github.com/peacprotocol/peac/sdks/go/middleware/chi => ../chi
	github.com/peacprotocol/peac/sdks/go/middleware/echo => ../echo
	github.com/peacprotocol/peac/sdks/go/middleware/nethttp => ../nethttp
)
