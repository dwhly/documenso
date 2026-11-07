import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

import { FleetPageHead } from '~/chief/fleet-page-head';
import { DocumentSearch } from '~/components/general/document/document-search';
import { DocumentsTableStatusFilter } from '~/components/tables/documents-table-status-filter';
import { InboxTable } from '~/components/tables/inbox-table';
import { INBOX_SELECTABLE_STATUSES } from '~/utils/inbox-search-params';
import { appMetaTags } from '~/utils/meta';

export function meta() {
  return appMetaTags(msg`Inbox`);
}

export default function InboxPage() {
  return (
    <div className="mx-auto w-full max-w-screen-xl px-4 md:px-8">
      <FleetPageHead
        className="mb-6"
        title={<Trans>Inbox</Trans>}
        subtitle={<Trans>Documents you have been invited to sign, approve or view.</Trans>}
      />

      <div className="fleet-filter-bar mb-4 flex flex-wrap items-center gap-x-2 gap-y-4">
        <div className="w-56">
          <DocumentSearch />
        </div>

        <DocumentsTableStatusFilter statuses={INBOX_SELECTABLE_STATUSES} />
      </div>

      <InboxTable />
    </div>
  );
}
