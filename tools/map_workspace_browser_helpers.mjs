// Use Element Plus' native arrow-key navigation, including overflowed tabs.
export async function selectMapLibraryTab(panel, name) {
  const tabs = panel.locator('.base-map-library-tabs');
  const target = tabs.getByRole('tab', { name, exact: true });
  const count = await tabs.getByRole('tab').count();
  for (let step = 0; step < count; step += 1) {
    if (await target.getAttribute('aria-selected') === 'true') return;
    await tabs.getByRole('tab', { selected: true }).press('ArrowRight');
  }
  if (await target.getAttribute('aria-selected') !== 'true') throw new Error(`Map library tab unavailable: ${name}`);
}
