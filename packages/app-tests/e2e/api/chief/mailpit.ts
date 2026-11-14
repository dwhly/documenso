// Reads the e2e stack's mail sink (Mailpit, started by chief/inventory/e2e/run.sh). Every SMTP message the server
// sends lands there; nothing here intercepts or replaces the server's transport.
const MAILPIT_URL = process.env.CHIEF_E2E_MAILPIT_URL ?? '';

export type SentMail = { to: string[]; subject: string; attachments: string[] };

type MailpitAddress = { Address: string };
type MailpitSummary = { ID: string; To: MailpitAddress[]; Subject: string; Attachments: number };
type MailpitMessage = { Attachments: Array<{ FileName: string; ContentType: string }> };

const get = async <T>(path: string): Promise<T> => {
  if (!MAILPIT_URL) {
    throw new Error('CHIEF_E2E_MAILPIT_URL is not set (run through chief/inventory/e2e/run.sh)');
  }

  const res = await fetch(`${MAILPIT_URL}${path}`);

  if (!res.ok) {
    throw new Error(`mailpit ${path}: ${res.status}`);
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return (await res.json()) as T;
};

/** Every message delivered to any of `addresses`, with its attachment file names. */
export const mailTo = async (addresses: string[]): Promise<SentMail[]> => {
  const wanted = new Set(addresses.map((a) => a.toLowerCase()));
  const { messages } = await get<{ messages: MailpitSummary[] }>('/api/v1/messages?limit=500');
  const mine = messages.filter((m) => m.To.some((to) => wanted.has(to.Address.toLowerCase())));

  return Promise.all(
    mine.map(async (m) => {
      const full = m.Attachments > 0 ? await get<MailpitMessage>(`/api/v1/message/${m.ID}`) : { Attachments: [] };

      return {
        to: m.To.map((to) => to.Address.toLowerCase()),
        subject: m.Subject,
        attachments: full.Attachments.map((a) => `${a.FileName} (${a.ContentType})`),
      };
    }),
  );
};
