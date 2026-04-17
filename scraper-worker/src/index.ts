import puppeteer from '@cloudflare/puppeteer';

interface Env {
  BROWSER: Fetcher;
}

const SLUG_RE = /^[a-z0-9-]+$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const slug = url.searchParams.get('slug');
    if (!slug || !SLUG_RE.test(slug) || slug.length > 120) {
      return json({ error: 'bad slug' }, 400);
    }

    const target = `https://polymarket.com/event/${slug}`;
    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
    try {
      browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20_000 });

      const handle = await page.waitForFunction(
        () => {
          const body = (document.body as HTMLElement).innerText || '';
          const m = body.match(/Price to beat[^$]*\$([0-9][0-9,]*\.?[0-9]*)/i);
          return m ? m[1] : null;
        },
        { timeout: 15_000, polling: 500 },
      );
      const raw = (await handle.jsonValue()) as string;
      const numeric = parseFloat(raw.replace(/,/g, ''));
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return json({ error: 'parse failed', raw }, 502);
      }
      return json({ slug, value: numeric, scrapedAt: Date.now() });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return json({ error: 'scrape failed', detail: msg }, 502);
    } finally {
      if (browser) await browser.close();
    }
  },
};
