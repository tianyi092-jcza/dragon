async (page) => {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const url = String(input);
      if (url.endsWith("/api/saves.json")) {
        const response = await nativeFetch(input, options);
        const runtime = window.__dragonInstance;
        if (runtime) {
          runtime.state = "lost";
          runtime.expiresAt = 0;
        }
        return response;
      }
      return nativeFetch(input, options);
    };
  });
  await page.reload();
  await page.waitForTimeout(1200);
  const result = await page.evaluate(() => ({
    app: Boolean(window.__dragonApp),
    state: window.__dragonInstance?.state,
    ai: Boolean(window.__aiTick),
  }));
  if (result.app || result.ai) throw new Error(JSON.stringify(result));
  return result;
}
