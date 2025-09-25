interface FirecrawlOptions {
  bridgeUrl?: string;
  enablePEAC?: boolean;
  onPaymentRequired?: (problem: any) => void;
}

export class PEACFirecrawlAdapter {
  private bridgeUrl: string;
  private enabled: boolean;
  private onPaymentRequired?: (problem: any) => void;

  constructor(options: FirecrawlOptions = {}) {
    this.bridgeUrl = options.bridgeUrl || 'http://127.0.0.1:31415';
    this.enabled = options.enablePEAC !== false;
    this.onPaymentRequired = options.onPaymentRequired;
  }

  async scrape(url: string, options: any = {}): Promise<any> {
    if (!this.enabled) return this.directScrape(url, options);

    try {
      const enforceResponse = await fetch(`${this.bridgeUrl}/enforce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: url, purpose: 'web-scraping' }),
      });

      if (enforceResponse.status === 402) {
        const problem = await enforceResponse.json();
        if (this.onPaymentRequired) this.onPaymentRequired(problem);
        throw new Error(`Payment required: ${problem.detail}`);
      }

      const result = await this.directScrape(url, options);
      if (result.receipt) {
        try {
          const verifyResponse = await fetch(`${this.bridgeUrl}/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ receipt: result.receipt }),
          });
          if (verifyResponse.ok) {
            const verifyResult = await verifyResponse.json();
            result._peac = { verified: verifyResult.valid, receipt: result.receipt };
          }
        } catch {}
      }
      return result;
    } catch (error: any) {
      console.warn('PEAC enforcement failed, falling back:', error.message);
      return this.directScrape(url, options);
    }
  }

  private async directScrape(url: string, options: any): Promise<any> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Firecrawl/1.0' },
      ...options,
    });
    const content = await response.text();
    return {
      success: response.ok,
      data: {
        markdown: content.substring(0, 1000) + '...',
        html: content,
        metadata: {
          title: 'Scraped Content',
          description: 'Content scraped via PEAC-enabled Firecrawl',
          sourceURL: url,
        },
      },
      receipt: response.headers.get('PEAC-Receipt'),
    };
  }
}

export default PEACFirecrawlAdapter;
