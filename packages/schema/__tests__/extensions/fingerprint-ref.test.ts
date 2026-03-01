/**
 * Fingerprint Reference Conversion Tests (v0.11.3+, DD-146)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  stringToFingerprintRef,
  fingerprintRefToString,
  MAX_FINGERPRINT_REF_LENGTH,
  type FingerprintRefObject,
} from '../../src/extensions/fingerprint-ref';

describe('stringToFingerprintRef', () => {
  it('should parse sha256 string form', () => {
    const result = stringToFingerprintRef(
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
    expect(result).not.toBeNull();
    expect(result!.alg).toBe('sha256');
    expect(result!.value).toBeTruthy();
  });

  it('should parse hmac-sha256 string form', () => {
    const result = stringToFingerprintRef(
      'hmac-sha256:f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f'
    );
    expect(result).not.toBeNull();
    expect(result!.alg).toBe('hmac-sha256');
  });

  it('should return null for unsupported algorithm', () => {
    expect(stringToFingerprintRef('md5:abc123')).toBeNull();
    expect(stringToFingerprintRef('sha512:abc')).toBeNull();
  });

  it('should return null for wrong hex length', () => {
    expect(stringToFingerprintRef('sha256:abc')).toBeNull();
    expect(stringToFingerprintRef('sha256:0123456789abcdef')).toBeNull();
  });

  it('should return null for invalid format', () => {
    expect(stringToFingerprintRef('')).toBeNull();
    expect(stringToFingerprintRef('just-a-string')).toBeNull();
    expect(stringToFingerprintRef('sha256:')).toBeNull();
  });

  it('should return null for uppercase hex', () => {
    expect(
      stringToFingerprintRef(
        'sha256:E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855'
      )
    ).toBeNull();
  });

  it('should reject string exceeding max length', () => {
    const overlong = 'sha256:' + 'a'.repeat(100);
    expect(stringToFingerprintRef(overlong)).toBeNull();
  });

  it('should export MAX_FINGERPRINT_REF_LENGTH constant', () => {
    expect(MAX_FINGERPRINT_REF_LENGTH).toBe(76);
  });
});

describe('fingerprintRefToString', () => {
  it('should convert sha256 object form to string', () => {
    const obj: FingerprintRefObject = {
      alg: 'sha256',
      value: '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
    };
    const result = fingerprintRefToString(obj);
    expect(result).toBe('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('should convert hmac-sha256 object form to string', () => {
    const obj: FingerprintRefObject = {
      alg: 'hmac-sha256',
      value: '8OHSw7Sllod4aVpLPC0eD_Dh0sO0pZaHeGlaSzwtHg8',
    };
    const result = fingerprintRefToString(obj);
    expect(result).toBe(
      'hmac-sha256:f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f'
    );
  });

  it('should return null for unsupported algorithm', () => {
    expect(fingerprintRefToString({ alg: 'md5', value: 'abc' })).toBeNull();
  });

  it('should return null for wrong value length', () => {
    expect(fingerprintRefToString({ alg: 'sha256', value: 'dG9vc2hvcnQ' })).toBeNull();
  });
});

describe('round-trip: string -> object -> string', () => {
  const testCases = [
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'hmac-sha256:f0e1d2c3b4a5968778695a4b3c2d1e0ff0e1d2c3b4a5968778695a4b3c2d1e0f',
    'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  ];

  for (const input of testCases) {
    it(`round-trip: ${input.substring(0, 30)}...`, () => {
      const obj = stringToFingerprintRef(input);
      expect(obj).not.toBeNull();
      const output = fingerprintRefToString(obj!);
      expect(output).toBe(input);
    });
  }
});

describe('strict base64url validation (RFC 4648)', () => {
  it('should reject padded base64 (= suffix)', () => {
    const padded: FingerprintRefObject = {
      alg: 'sha256',
      value: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=',
    };
    expect(fingerprintRefToString(padded)).toBeNull();
  });

  it('should reject standard base64 characters (+ and /)', () => {
    const stdBase64: FingerprintRefObject = {
      alg: 'sha256',
      value: '47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU',
    };
    expect(fingerprintRefToString(stdBase64)).toBeNull();
  });

  it('should reject whitespace in value', () => {
    const withSpace: FingerprintRefObject = {
      alg: 'sha256',
      value: '47DEQpj8HBSa _TImW 5JCeuQeRkm5NMpJWZG3hSuFU',
    };
    expect(fingerprintRefToString(withSpace)).toBeNull();
  });

  it('should reject newline in value', () => {
    const withNewline: FingerprintRefObject = {
      alg: 'sha256',
      value: '47DEQpj8HBSa\n_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
    };
    expect(fingerprintRefToString(withNewline)).toBeNull();
  });

  it('should reject tab in value', () => {
    const withTab: FingerprintRefObject = {
      alg: 'sha256',
      value: '47DEQpj8HBSa\t_TImW-5JCeuQeRkm5NMpJWZG3hSuFU',
    };
    expect(fingerprintRefToString(withTab)).toBeNull();
  });

  it('should reject empty value', () => {
    const empty: FingerprintRefObject = { alg: 'sha256', value: '' };
    expect(fingerprintRefToString(empty)).toBeNull();
  });
});

describe('fuzz-style malformed input tests', () => {
  const malformedStrings = [
    'sha256:',
    ':e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85', // 63 chars
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b8550', // 65 chars
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b85g', // 'g' not hex
    'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 ', // trailing space
    ' sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // leading space
    'sha256 :e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // space before colon
    'SHA256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // uppercase alg
    'sha256:e3b0c442 98fc1c14 9afbf4c8 996fb924 27ae41e4 649b934c a495991b 7852b855', // spaces in hex
    'null',
    'undefined',
    '{}',
    '[]',
  ];

  for (const input of malformedStrings) {
    it(`should reject malformed: ${JSON.stringify(input).substring(0, 50)}`, () => {
      expect(stringToFingerprintRef(input)).toBeNull();
    });
  }

  const malformedObjects: { desc: string; obj: FingerprintRefObject }[] = [
    { desc: 'null alg', obj: { alg: null as unknown as string, value: 'AAAA' } },
    { desc: 'numeric alg', obj: { alg: 123 as unknown as string, value: 'AAAA' } },
    { desc: 'empty alg', obj: { alg: '', value: 'AAAA' } },
    {
      desc: 'unicode in value',
      obj: { alg: 'sha256', value: '\u00e9\u00e8\u00ea' },
    },
  ];

  for (const { desc, obj } of malformedObjects) {
    it(`should reject malformed object: ${desc}`, () => {
      expect(fingerprintRefToString(obj)).toBeNull();
    });
  }
});

describe('golden vectors from conformance fixtures', () => {
  const fixtures = JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        '../../../../specs/conformance/fixtures/fingerprint-ref/golden-vectors.json'
      ),
      'utf-8'
    )
  );

  for (const vector of fixtures.vectors) {
    it(`string->object: ${vector.name}`, () => {
      const result = stringToFingerprintRef(vector.string_form);
      expect(result).not.toBeNull();
      expect(result!.alg).toBe(vector.object_form.alg);
      expect(result!.value).toBe(vector.object_form.value);
    });

    it(`object->string: ${vector.name}`, () => {
      const result = fingerprintRefToString(vector.object_form);
      expect(result).toBe(vector.string_form);
    });
  }
});
