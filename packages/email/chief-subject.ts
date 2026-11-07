/**
 * Chief (Fleet Dealroom) subject prefix: `Fleet Dealroom: <what>` (dealroom shell spec §0), applied once at
 * the transport so Documenso's ~40 subject call sites stay upstream. Off unless
 * NEXT_PRIVATE_EMAIL_SUBJECT_PREFIX is set.
 */
const LOWERCASE_LEADS = new Set([
  'a', 'action', 'an', 'complete', 'confirm', 'document', 'documents', 'email', 'new', 'please', 'reset',
  'sign', 'signing', 'team', 'the', 'this', 'verify', 'welcome', 'you', 'your',
]);

export const withSubjectPrefix = (subject: string, prefix: string | undefined) => {
  const brand = prefix?.trim();

  if (!brand || !subject || subject.startsWith(brand)) {
    return subject;
  }

  // "Please sign X" -> "please sign X"; names and titles at the start keep their case.
  const firstWord = subject.split(/\s/, 1)[0].replace(/[^A-Za-z]/g, '');
  const body = LOWERCASE_LEADS.has(firstWord.toLowerCase()) && firstWord !== firstWord.toUpperCase()
    ? subject.charAt(0).toLowerCase() + subject.slice(1)
    : subject;

  return `${brand}: ${body}`;
};
