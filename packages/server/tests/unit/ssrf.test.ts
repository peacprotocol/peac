import { SSRFGuard } from '../../src/utils/ssrf';

// Mock DNS so we control the resolved IPs
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(async (_host: string, _opts: any) => [{ address: '93.184.216.34' }])
}));

describe('SSRF guard', () => {
  it('blocks loopback literal IP', async () => {
    const g = new SSRFGuard([]);
    await expect(g.assertAllowedOutbound('http://127.0.0.1:8080/')).rejects.toThrow(/blocked_address/);
  });

  it('blocks link-local', async () => {
    const g = new SSRFGuard([]);
    await expect(g.assertAllowedOutbound('http://169.254.1.1/')).rejects.toThrow(/blocked_address/);
  });

  it('blocks RFC1918 ranges', async () => {
    const g = new SSRFGuard([]);
    await expect(g.assertAllowedOutbound('http://10.0.0.1/')).rejects.toThrow(/blocked_address/);
    await expect(g.assertAllowedOutbound('http://192.168.1.1/')).rejects.toThrow(/blocked_address/);
    await expect(g.assertAllowedOutbound('http://172.16.0.1/')).rejects.toThrow(/blocked_address/);
  });

  it('blocks IPv4-mapped IPv6', async () => {
    const g = new SSRFGuard([]);
    await expect(g.assertAllowedOutbound('http://[::ffff:127.0.0.1]/')).rejects.toThrow(/blocked_address/);
  });

  it('allowlisted hostname passes', async () => {
    const g = new SSRFGuard(['example.com']);
    await expect(g.assertAllowedOutbound('https://api.example.com/resource')).resolves.toBeUndefined();
  });
});
