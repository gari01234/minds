/* Explicit app identity and conservative migration of Theory's old browser cache. */
(() => {
  const theoryKey = 'minds_theory_scoped_conversations_v1';
  function isTheory(c) {
    if (!c || typeof c !== 'object') return false;
    if (c.app_scope && c.app_scope !== 'theory') return false;
    if (c.metadata?.app && c.metadata.app !== 'theory') return false;
    const origin = c.origin || c.origin_anchor;
    if (origin?.type === 'assistant' || origin?.id === 'isabella') return false;
    return !origin || ['global', 'mind', 'reading'].includes(origin.type);
  }
  function readTheoryCache() {
    try {
      const scoped = localStorage.getItem(theoryKey);
      const rows = JSON.parse(scoped ?? localStorage.getItem('minds_theory_v09_conversations') ?? '[]');
      return Array.isArray(rows) ? rows.filter(isTheory).map(c => ({...c, app_scope:'theory'})) : [];
    } catch { return []; }
  }
  window.MINDS_CONVERSATION_SCOPE = Object.freeze({theoryKey, isTheory, readTheoryCache});
})();
