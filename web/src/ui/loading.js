// Show only during work, not while the user must choose. Modal focus prevents duplicate input.
export async function withLoading(label, load) {
  const mask = document.createElement('dialog');
  mask.className = 'start-loading';
  mask.setAttribute('aria-label', label);
  mask.addEventListener('cancel', event => event.preventDefault());
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.textContent = label;
  const progress = document.createElement('progress');
  progress.setAttribute('aria-label', label);
  mask.append(status, progress);
  document.body.append(mask);
  try {
    mask.showModal();
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    return await load();
  } finally { mask.remove(); }
}
