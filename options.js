const fields = {
  ncbiApiKey: document.getElementById('ncbiApiKey'),
  ncbiEmail: document.getElementById('ncbiEmail'),
  anthropicApiKey: document.getElementById('anthropicApiKey'),
  anthropicModel: document.getElementById('anthropicModel'),
};

async function load() {
  const stored = await chrome.storage.local.get([
    'ncbiApiKey',
    'ncbiEmail',
    'anthropicApiKey',
    'anthropicModel',
  ]);
  fields.ncbiApiKey.value = stored.ncbiApiKey || '';
  fields.ncbiEmail.value = stored.ncbiEmail || '';
  fields.anthropicApiKey.value = stored.anthropicApiKey || '';
  fields.anthropicModel.value = stored.anthropicModel || 'claude-opus-5';
}

document.getElementById('save').addEventListener('click', async () => {
  await chrome.storage.local.set({
    ncbiApiKey: fields.ncbiApiKey.value.trim(),
    ncbiEmail: fields.ncbiEmail.value.trim(),
    anthropicApiKey: fields.anthropicApiKey.value.trim(),
    anthropicModel: fields.anthropicModel.value,
  });
  const msg = document.getElementById('savedMsg');
  msg.classList.add('show');
  setTimeout(() => msg.classList.remove('show'), 1600);
});

load();
