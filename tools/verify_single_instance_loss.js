async (page) => {
  await page.waitForFunction(() => Boolean(window.__dragonApp));
  await page.route("**/api/instance/heartbeat", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, reason: "lease-lost" }),
    });
  });
  await page.waitForFunction(() => window.__dragonInstance?.state === "lost", null, {
    timeout: 10000,
  });
  const result = await page.evaluate(async () => ({
    state: window.__dragonInstance?.state,
    enabled: window.__dragonApp.runtimeEnabled,
    saved: await window.__dragonApp.saveGame(0, "BLOCKED"),
  }));
  if (result.state !== "lost" || result.enabled || result.saved?.saved !== "blocked")
    throw new Error(JSON.stringify(result));
  return result;
}
