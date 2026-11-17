import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';

import { SignaturePadDialog } from '../../../packages/ui/primitives/signature-pad/signature-pad-dialog';
import { Toaster } from '../../../packages/ui/primitives/toaster';

const i18n = setupI18n({ locale: 'en', messages: {} });

const Fixture = () => {
  const [signature, setSignature] = useState('');
  return (
    <I18nProvider i18n={i18n}>
      <header className="fds-header">
        <span className="fds-lockup">
          <span className="fds-lockup__family">Fleet</span>
          <span className="fds-lockup__rule" />
          <span className="fds-lockup__product">Sign</span>
        </span>
      </header>
      <main style={{ maxWidth: 480, margin: '48px auto', padding: 24 }}>
        <h1 className="text-xl">Your signature</h1>
        <p className="mb-4 text-muted-foreground">Local signature dialog check · Grace Hopper</p>
        <SignaturePadDialog fullName="Grace Hopper" value={signature} onChange={setSignature} />
        <output hidden data-testid="signature-result">
          {signature}
        </output>
      </main>
      <Toaster />
    </I18nProvider>
  );
};

const app = document.getElementById('app');
if (app) {
  createRoot(app).render(<Fixture />);
}
