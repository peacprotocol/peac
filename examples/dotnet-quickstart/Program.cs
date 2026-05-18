// PEAC interaction-record+jwt verifier — .NET quickstart.
//
// This is a quickstart example, NOT an official PEAC .NET SDK. The PEAC
// project ships no NuGet package and no public .NET protocol surface.
// The example reads the committed Ed25519 issuer key and signed records
// from this example's own fixtures/ directory and verifies each record
// at runtime without any network access, hosted verifier call, or live
// vendor transcript. Dependency restore at build time may contact the
// configured NuGet feed; verification itself reads only local files.
//
// Verification steps for each record:
//   1. Split the compact JWS into header, payload, signature; reject
//      empty input and empty segments.
//   2. Confirm the JOSE header is { "typ": "interaction-record+jwt",
//      "alg": "EdDSA", "kid": <kid> } and kid matches the issuer key;
//      reject unsupported header parameters (crit, b64).
//   3. Verify the Ed25519 signature over `<header>.<payload>` using the
//      issuer's Ed25519 public key (base64url-decoded from
//      pubkey.public_key_b64u).
//   4. Decode and inspect the payload claims needed by this quickstart:
//      iss, kind, type, and the agent-action extension event_kind.
//
// The runtime exit code is 0 when every record verifies; non-zero
// otherwise.

using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using NSec.Cryptography;

namespace PeacDotnetQuickstart;

internal static class Program
{
    private const string ExpectedTyp = "interaction-record+jwt";
    private const string ExpectedAlg = "EdDSA";
    private const string ExpectedKind = "evidence";
    private const string AgentActionExtensionKey = "org.peacprotocol/agent-action";
    private const int ExpectedRecordCount = 6;

    // Allowlist of JOSE protected-header names this quickstart understands.
    // Any other header name (including `crit` and `b64`) fails closed.
    private static readonly HashSet<string> AllowedProtectedHeaderNames = new(StringComparer.Ordinal)
    {
        "typ",
        "alg",
        "kid",
    };

    // Exact six-event coverage the quickstart promises. Maps
    // event_kind discriminator to the canonical record-type URI.
    private static readonly IReadOnlyDictionary<string, string> ExpectedEventTypes = new Dictionary<
        string,
        string
    >(StringComparer.Ordinal)
    {
        ["agent-action-invoked-observed"] = "org.peacprotocol/agent-action-invoked-observed",
        ["agent-action-delegated-observed"] = "org.peacprotocol/agent-action-delegated-observed",
        ["agent-action-approved-observed"] = "org.peacprotocol/agent-action-approved-observed",
        ["agent-action-denied-observed"] = "org.peacprotocol/agent-action-denied-observed",
        ["agent-action-cancelled-observed"] = "org.peacprotocol/agent-action-cancelled-observed",
        ["agent-action-timed-out-observed"] = "org.peacprotocol/agent-action-timed-out-observed",
    };

    private static int Main()
    {
        try
        {
            string projectDir = ResolveProjectDir();
            string fixturesDir = Path.Combine(projectDir, "fixtures");
            string pubkeyPath = Path.Combine(fixturesDir, "pubkey.json");
            string recordsPath = Path.Combine(fixturesDir, "records.json");

            Console.WriteLine(
                "PEAC .NET quickstart: verification of committed records using local fixtures."
            );
            Console.WriteLine($"Public key file:  {DisplayPath(pubkeyPath)}");
            Console.WriteLine($"Records file:     {DisplayPath(recordsPath)}");
            Console.WriteLine();

            IssuerKey issuer = LoadIssuerKey(pubkeyPath);
            Console.WriteLine($"Issuer iss:       {issuer.Iss}");
            Console.WriteLine($"Issuer kid:       {issuer.Kid}");
            Console.WriteLine();

            JsonNode recordsRoot =
                JsonNode.Parse(File.ReadAllText(recordsPath))
                ?? throw new InvalidDataException("records.json is empty");
            JsonArray records =
                recordsRoot["records"]?.AsArray()
                ?? throw new InvalidDataException("records.json missing 'records' array");

            // The quickstart promises to verify six records covering
            // every agent-action-*-observed event kind. Fail closed if
            // the fixture count drifts from that contract.
            if (records.Count != ExpectedRecordCount)
            {
                throw new InvalidDataException(
                    $"records.json must contain {ExpectedRecordCount} records, got {records.Count}"
                );
            }

            Ed25519 algorithm = SignatureAlgorithm.Ed25519;
            PublicKey publicKey = PublicKey.Import(
                algorithm,
                issuer.PublicKeyBytes,
                KeyBlobFormat.RawPublicKey
            );

            int verified = 0;
            int total = 0;
            HashSet<string> seenEventKinds = new(StringComparer.Ordinal);
            foreach (JsonNode? node in records)
            {
                total++;
                if (node is null)
                {
                    Console.WriteLine($"[FAIL] #{total} -> null record entry");
                    continue;
                }

                string fixture = node["fixture"]?.GetValue<string>() ?? $"#{total}";
                string declaredType = node["type"]?.GetValue<string>() ?? "(no type)";
                string? declaredEventKind = node["event_kind"]?.GetValue<string>();
                string? jws = node["jws"]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(fixture))
                {
                    Console.WriteLine($"[FAIL] #{total} -> missing or empty fixture name");
                    continue;
                }
                if (string.IsNullOrWhiteSpace(declaredType) || declaredType == "(no type)")
                {
                    Console.WriteLine($"[FAIL] {fixture} -> missing or empty type");
                    continue;
                }
                if (string.IsNullOrWhiteSpace(declaredEventKind))
                {
                    Console.WriteLine($"[FAIL] {fixture} -> missing or empty event_kind");
                    continue;
                }
                if (string.IsNullOrWhiteSpace(jws))
                {
                    Console.WriteLine($"[FAIL] {fixture} ({declaredType}) -> missing or empty jws");
                    continue;
                }

                VerifyResult result = VerifyJws(jws!, publicKey, issuer);
                if (!result.Ok)
                {
                    Console.WriteLine($"[FAIL] {fixture} ({declaredType}) -> {result.Reason}");
                    continue;
                }

                // Cross-check the inner record `type` claim against the
                // outer index entry. Mismatches indicate the index drifted
                // from the signed payload.
                string innerType = result.Payload!["type"]?.GetValue<string>() ?? "";
                if (innerType != declaredType)
                {
                    Console.WriteLine(
                        $"[FAIL] {fixture}: index type {declaredType} != payload type {innerType}"
                    );
                    continue;
                }

                // The agent-action extension MUST exist in the signed
                // payload under the canonical extension key, and the
                // extension's event_kind MUST equal the records.json
                // event_kind. Together these protect against an index
                // entry drifting from the signed payload's extension
                // body.
                JsonNode? extensions = result.Payload!["extensions"];
                JsonNode? agentActionExt = extensions?[AgentActionExtensionKey];
                if (agentActionExt is null)
                {
                    Console.WriteLine(
                        $"[FAIL] {fixture}: payload missing extensions['{AgentActionExtensionKey}']"
                    );
                    continue;
                }
                string innerEventKind = agentActionExt["event_kind"]?.GetValue<string>() ?? "";
                if (innerEventKind != declaredEventKind)
                {
                    Console.WriteLine(
                        $"[FAIL] {fixture}: index event_kind {declaredEventKind} != payload extension event_kind {innerEventKind}"
                    );
                    continue;
                }

                // Exact six-event coverage: the event_kind MUST be one
                // of the six the quickstart expects, the declared type
                // MUST match the canonical URI for that event_kind, and
                // duplicate event_kind across the corpus MUST fail.
                if (!ExpectedEventTypes.TryGetValue(declaredEventKind, out string? expectedType))
                {
                    Console.WriteLine(
                        $"[FAIL] {fixture}: unexpected event_kind {declaredEventKind}"
                    );
                    continue;
                }
                if (declaredType != expectedType)
                {
                    Console.WriteLine(
                        $"[FAIL] {fixture}: event_kind {declaredEventKind} expects type {expectedType}, got {declaredType}"
                    );
                    continue;
                }
                if (!seenEventKinds.Add(declaredEventKind))
                {
                    Console.WriteLine(
                        $"[FAIL] {fixture}: duplicate event_kind {declaredEventKind} in corpus"
                    );
                    continue;
                }

                Console.WriteLine($"[OK]   {fixture} ({declaredType})");
                verified++;
            }

            // Any missing expected event_kind is a closeout failure;
            // having six records is necessary but not sufficient.
            foreach (string expectedKind in ExpectedEventTypes.Keys)
            {
                if (!seenEventKinds.Contains(expectedKind))
                {
                    Console.WriteLine(
                        $"[FAIL] missing expected event_kind {expectedKind} (corpus did not cover it)"
                    );
                }
            }

            Console.WriteLine();
            Console.WriteLine($"Verified {verified} of {total} record(s) from local fixtures.");
            bool ok =
                verified == total
                && total == ExpectedRecordCount
                && seenEventKinds.Count == ExpectedEventTypes.Count;
            return ok ? 0 : 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"quickstart failed: {ex.Message}");
            return 2;
        }
    }

    private static VerifyResult VerifyJws(string jws, PublicKey publicKey, IssuerKey issuer)
    {
        if (string.IsNullOrWhiteSpace(jws))
        {
            return VerifyResult.Fail("empty JWS input");
        }

        string[] parts = jws.Split('.');
        if (parts.Length != 3)
        {
            return VerifyResult.Fail("not a compact JWS (expected 3 segments)");
        }
        if (parts.Any(part => part.Length == 0))
        {
            return VerifyResult.Fail("compact JWS contains an empty segment");
        }

        byte[] headerBytes;
        byte[] payloadBytes;
        byte[] signatureBytes;
        try
        {
            headerBytes = Base64UrlDecode(parts[0]);
            payloadBytes = Base64UrlDecode(parts[1]);
            signatureBytes = Base64UrlDecode(parts[2]);
        }
        catch (FormatException ex)
        {
            return VerifyResult.Fail($"base64url decode: {ex.Message}");
        }

        JsonNode? header;
        try
        {
            header = JsonNode.Parse(headerBytes);
        }
        catch (JsonException ex)
        {
            return VerifyResult.Fail($"invalid JOSE header JSON: {ex.Message}");
        }
        if (header is null)
        {
            return VerifyResult.Fail("empty JOSE header");
        }
        string headerTyp = header["typ"]?.GetValue<string>() ?? "";
        if (headerTyp != ExpectedTyp)
        {
            return VerifyResult.Fail($"unexpected typ '{headerTyp}', want '{ExpectedTyp}'");
        }
        string headerAlg = header["alg"]?.GetValue<string>() ?? "";
        if (headerAlg != ExpectedAlg)
        {
            return VerifyResult.Fail($"unexpected alg '{headerAlg}', want '{ExpectedAlg}'");
        }
        string headerKid = header["kid"]?.GetValue<string>() ?? "";
        if (headerKid != issuer.Kid)
        {
            return VerifyResult.Fail($"unexpected kid '{headerKid}', want '{issuer.Kid}'");
        }
        // Reject any JOSE protected-header name outside the allowlist.
        // RFC 7515 §4.1.11 `crit` (critical extensions) and RFC 7797
        // `b64` (unencoded payload) both alter signing-input semantics;
        // every other unknown header name also fails closed so this
        // quickstart never silently accepts a record it did not expect.
        foreach (KeyValuePair<string, JsonNode?> entry in header.AsObject())
        {
            if (!AllowedProtectedHeaderNames.Contains(entry.Key))
            {
                return VerifyResult.Fail($"unsupported JOSE header '{entry.Key}'");
            }
        }

        // Ed25519 signatures are fixed 64-byte values; reject malformed
        // signature lengths before handing to the verifier so the
        // failure reason stays specific.
        if (signatureBytes.Length != 64)
        {
            return VerifyResult.Fail(
                $"Ed25519 signature MUST be 64 bytes, got {signatureBytes.Length}"
            );
        }

        // Ed25519 signs `<base64url(header)>.<base64url(payload)>` as
        // ASCII; this is the JWS Signing Input per RFC 7515 §5.1.
        string signingInputStr = string.Concat(parts[0], ".", parts[1]);
        byte[] signingInput = Encoding.ASCII.GetBytes(signingInputStr);

        Ed25519 algorithm = SignatureAlgorithm.Ed25519;
        bool ok = algorithm.Verify(publicKey, signingInput, signatureBytes);
        if (!ok)
        {
            return VerifyResult.Fail("Ed25519 signature did not verify");
        }

        JsonNode? payload;
        try
        {
            payload = JsonNode.Parse(payloadBytes);
        }
        catch (JsonException ex)
        {
            return VerifyResult.Fail($"invalid record payload JSON: {ex.Message}");
        }
        if (payload is null)
        {
            return VerifyResult.Fail("empty record payload");
        }
        string iss = payload["iss"]?.GetValue<string>() ?? "";
        if (iss != issuer.Iss)
        {
            return VerifyResult.Fail($"payload iss '{iss}' != issuer iss '{issuer.Iss}'");
        }
        string kind = payload["kind"]?.GetValue<string>() ?? "";
        if (kind != ExpectedKind)
        {
            return VerifyResult.Fail($"unexpected kind '{kind}', want '{ExpectedKind}'");
        }

        return VerifyResult.Pass(payload);
    }

    private static IssuerKey LoadIssuerKey(string path)
    {
        JsonNode root =
            JsonNode.Parse(File.ReadAllText(path))
            ?? throw new InvalidDataException("pubkey.json is empty");
        string iss =
            root["iss"]?.GetValue<string>()
            ?? throw new InvalidDataException("pubkey.json missing 'iss'");
        string kid =
            root["kid"]?.GetValue<string>()
            ?? throw new InvalidDataException("pubkey.json missing 'kid'");
        string publicKeyB64u =
            root["public_key_b64u"]?.GetValue<string>()
            ?? throw new InvalidDataException("pubkey.json missing 'public_key_b64u'");

        byte[] publicKeyBytes = Base64UrlDecode(publicKeyB64u);
        if (publicKeyBytes.Length != 32)
        {
            throw new InvalidDataException(
                $"Ed25519 public key MUST be 32 bytes, got {publicKeyBytes.Length}"
            );
        }
        return new IssuerKey(iss, kid, publicKeyBytes);
    }

    private static byte[] Base64UrlDecode(string input)
    {
        if (string.IsNullOrEmpty(input))
        {
            throw new FormatException("base64url segment is empty");
        }

        if (input.Contains('='))
        {
            throw new FormatException("base64url segment MUST NOT contain padding");
        }

        foreach (char ch in input)
        {
            bool ok =
                (ch >= 'A' && ch <= 'Z')
                || (ch >= 'a' && ch <= 'z')
                || (ch >= '0' && ch <= '9')
                || ch == '-'
                || ch == '_';

            if (!ok)
            {
                throw new FormatException($"invalid base64url character '{ch}'");
            }
        }

        if (input.Length % 4 == 1)
        {
            throw new FormatException("invalid base64url length");
        }

        string padded = input
            .Replace('-', '+')
            .Replace('_', '/')
            .PadRight(input.Length + (4 - input.Length % 4) % 4, '=');

        return Convert.FromBase64String(padded);
    }

    private static string ResolveProjectDir()
    {
        // Fixtures live next to the .csproj, not next to the build
        // output. Resolve by walking up from the running assembly's
        // location until a fixtures/ directory is found alongside.
        string? current = AppContext.BaseDirectory;
        for (int i = 0; i < 8 && !string.IsNullOrEmpty(current); i++)
        {
            string candidate = Path.Combine(current, "fixtures", "pubkey.json");
            if (File.Exists(candidate))
            {
                return Path.GetFullPath(current);
            }
            current = Path.GetDirectoryName(current);
        }

        // Fallback to current working directory if the search did not
        // find a fixtures/ sibling. Useful when running the example
        // from inside its directory.
        return Directory.GetCurrentDirectory();
    }

    private static string DisplayPath(string path)
    {
        string cwd = Directory.GetCurrentDirectory();
        try
        {
            return Path.GetRelativePath(cwd, path);
        }
        catch
        {
            return path;
        }
    }

    private sealed record IssuerKey(string Iss, string Kid, byte[] PublicKeyBytes);

    private sealed record VerifyResult(bool Ok, string? Reason, JsonNode? Payload)
    {
        public static VerifyResult Pass(JsonNode payload) => new(true, null, payload);

        public static VerifyResult Fail(string reason) => new(false, reason, null);
    }
}
