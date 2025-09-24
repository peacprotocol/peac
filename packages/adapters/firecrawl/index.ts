// SPDX-License-Identifier: Apache-2.0

interface FirecrawlOptions {
  bridgeUrl?: string;
  enablePEAC?: boolean;
  onPaymentRequired?: (problem: any) => void;
}

class PEACFirecrawlAdapter {
  private bridgeUrl: string;
  private enabled: boolean;
  private onPaymentRequired?: (problem: any) => void;

  constructor(options: FirecrawlOptions = {}) {
    this.bridgeUrl = options.bridgeUrl || 'http://127.0.0.1:31415';
    this.enabled = options.enablePEAC !== false;
    this.onPaymentRequired = options.onPaymentRequired;
  }

  async scrape(url: string, options: any = {}): Promise<any> {
    if (!this.enabled) {
      return this.directScrape(url, options);
    }

    try {
      // Pre-enforce
      const enforceResponse = await fetch(`${this.bridgeUrl}/enforce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: url,
          purpose: 'web-scraping'
        })
      });

      if (enforceResponse.status === 402) {
        const problem = await enforceResponse.json();
        if (this.onPaymentRequired) {
          this.onPaymentRequired(problem);
        }
        throw new Error(`Payment required: ${problem.detail}`);
      }

      // Proceed with scraping
      const result = await this.directScrape(url, options);

      // Try to attach receipt if available
      try {
        const verifyResponse = await fetch(`${this.bridgeUrl}/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ receipt: result.receipt || null })
        });

        if (verifyResponse.ok) {
          const verifyResult = await verifyResponse.json();
          result._peac = {
            verified: verifyResult.valid,
            receipt: result.receipt
          };
        }
      } catch {
        // Verification failed - continue without PEAC metadata
      }

      return result;

    } catch (error: any) {
      // Fallback to direct scraping on PEAC errors
      console.warn('PEAC enforcement failed, falling back:', error.message);
      return this.directScrape(url, options);
    }
  }

  private async directScrape(url: string, options: any): Promise<any> {
    // Mock Firecrawl scraping - replace with actual Firecrawl API calls
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Firecrawl/1.0' },
      ...options
    });

    const content = await response.text();
    const receipt = response.headers.get('PEAC-Receipt');

    return {
      success: response.ok,
      data: {
        markdown: content.substring(0, 1000) + '...', // Truncated for demo
        html: content,
        metadata: {
          title: 'Scraped Content',
          description: 'Content scraped via PEAC-enabled Firecrawl',
          sourceURL: url
        }
      },
      receipt
    };
  }

  // Streaming scrape with PEAC integration
  async *scrapeStream(url: string, options: any = {}): AsyncGenerator<any> {
    if (!this.enabled) {
      yield* this.directScrapeStream(url, options);
      return;
    }

    try {
      // Pre-enforce for streaming
      const enforceResponse = await fetch(`${this.bridgeUrl}/enforce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resource: url,
          purpose: 'streaming-scrape'
        })
      });

      if (!enforceResponse.ok) {
        throw new Error('PEAC enforcement failed');
      }

      yield* this.directScrapeStream(url, options);

    } catch (error) {
      console.warn('PEAC streaming failed:', error);
      yield* this.directScrapeStream(url, options);
    }
  }

  private async *directScrapeStream(url: string, options: any): AsyncGenerator<any> {
    // Mock streaming implementation
    const chunks = ['chunk1', 'chunk2', 'chunk3'];
    for (const chunk of chunks) {
      yield { data: chunk, progress: chunks.indexOf(chunk) + 1 };
      await new Promise(r => setTimeout(r, 100)); // Simulate delay
    }
  }
}

export { PEACFirecrawlAdapter };
export default PEACFirecrawlAdapter;