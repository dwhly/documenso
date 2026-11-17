import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { FleetVisitorFooter } from '../../apps/remix/app/chief/fleet-header';
import { DEFAULT_TENANT } from '../../apps/remix/app/chief/tenant-brand';
import { TenantBrandProvider } from '../../apps/remix/app/chief/tenant-identity';

const Fixture = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasPanel, setHasPanel] = useState(true);
  const [view, setView] = useState('signing');
  const [name, setName] = useState('AmForge');
  const brand = {
    ...DEFAULT_TENANT,
    name,
    attribution: {
      FLEET_TENANT_NAME: name,
      FLEET_ABOUT_URL: 'https://fleet.example.test/about',
      FLEET_SOURCE_URL: 'https://source.example.test/tree/0123456789abcdef',
    },
  };

  return (
    <TenantBrandProvider value={brand}>
      <nav aria-label="Fixture controls">
        <button type="button" onClick={() => setView('signing')}>
          Signing
        </button>
        <button type="button" onClick={() => setView('complete')}>
          Completed
        </button>
        <button type="button" onClick={() => setView('error')}>
          Error
        </button>
        <button type="button" onClick={() => setHasPanel(!hasPanel)}>
          Toggle panel
        </button>
        <button type="button" onClick={() => setName('LongTenantName'.repeat(12))}>
          Long tenant
        </button>
      </nav>
      <div className="min-h-screen" data-fleet-signing={view === 'signing' || undefined}>
        <main>
          {view === 'signing' ? (
            <div className="min-h-screen w-screen bg-gray-50 dark:bg-background">
              <header className="fleet-signer-chrome">
                <div className="fds-header fleet-header">Sign · Mutual Non-Disclosure Agreement</div>
                <div className="fleet-context-bar__inner fleet-visitor-container">Invited to sign</div>
              </header>
              <div className="flex h-[calc(100vh-var(--signer-chrome-h,4rem))] w-screen">
                <aside className="hidden w-80 flex-shrink-0 border-r p-4 lg:block">Sign document</aside>
                <div className="embed--DocumentContainer min-w-0 flex-1 overflow-y-auto">
                  <div className="embed--DocumentViewer flex flex-col items-center justify-center p-2 sm:mt-4 sm:p-4">
                    <article className="min-h-[1100px] w-full rounded-xl border bg-white p-8 text-black">
                      <h1>Mutual Non-Disclosure Agreement</h1>
                      <p>Static signing-page fixture. Document ready for signature.</p>
                    </article>
                    <p>Page 1 of 2</p>
                    <div className="block pb-28 lg:hidden">
                      {hasPanel && (
                        <div className="pointer-events-none fixed right-0 bottom-0 left-0 z-50 flex justify-center px-2 pb-2 sm:px-4 sm:pb-6">
                          <div className="pointer-events-auto w-full max-w-[760px]">
                            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
                              <div className="flex items-center justify-between gap-4 p-4">
                                <div className="flex flex-1 items-center gap-3">
                                  <button type="button" className="fds-btn" onClick={() => setIsExpanded(!isExpanded)}>
                                    {isExpanded ? 'Collapse' : 'Expand'}
                                  </button>
                                  <div>
                                    <h2 className="font-semibold text-foreground text-lg">Sign document</h2>
                                    <p className="-mt-0.5 text-muted-foreground text-sm">1 field remaining</p>
                                  </div>
                                </div>
                                <button type="button" className="fds-btn fds-btn--primary">
                                  Next field
                                </button>
                              </div>
                              <div className="px-4 pb-3">
                                <div className="h-[4px] rounded-md bg-muted" />
                              </div>
                              {isExpanded && <div className="h-48 border-t p-4">Signature fields</div>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="fleet-visitor-container py-32">
              <h1>{view === 'complete' ? 'Your document is signed' : 'Unable to sign this document'}</h1>
            </div>
          )}
        </main>
        <FleetVisitorFooter />
      </div>
    </TenantBrandProvider>
  );
};

const app = document.getElementById('app');
if (app) {
  createRoot(app).render(<Fixture />);
}
