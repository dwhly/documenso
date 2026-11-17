export const reserveSigningPanelSpace = (footer: HTMLElement) => {
  const page = footer.parentElement;
  if (!page) {
    return;
  }

  // Upstream's V2 mobile panel and V1 widget have no stable data attribute.
  const panelSelector = '.embed--DocumentViewer .pointer-events-none.fixed.bottom-0, [class~="group/document-widget"]';
  let panels: HTMLElement[] = [];
  const update = () => {
    if (!page.hasAttribute('data-fleet-signing')) {
      page.style.removeProperty('--fleet-signing-panel-height');
      return;
    }

    const height = panels.reduce((space, panel) => {
      const bounds = panel.getBoundingClientRect();
      if (!bounds.height || getComputedStyle(panel).position !== 'fixed') {
        return space;
      }

      // Include the panel's bottom inset as well as its border box.
      return Math.max(space, window.innerHeight - bounds.top);
    }, 0);
    page.style.setProperty('--fleet-signing-panel-height', `${height}px`);
  };
  const resize = new ResizeObserver(update);
  const refresh = () => {
    resize.disconnect();
    panels = Array.from(page.querySelectorAll<HTMLElement>(panelSelector));
    for (const panel of panels) {
      resize.observe(panel);
    }
    update();
  };
  const mutations = new MutationObserver(refresh);
  mutations.observe(page, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-fleet-signing'],
  });
  window.addEventListener('resize', update);
  refresh();

  return () => {
    resize.disconnect();
    mutations.disconnect();
    window.removeEventListener('resize', update);
    page.style.removeProperty('--fleet-signing-panel-height');
  };
};
