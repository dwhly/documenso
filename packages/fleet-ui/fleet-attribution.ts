/** Canonical fleet-attribution/page, /email-html and /email-text templates. */
export type AttributionSettings = Record<string, string | undefined>;

const urlPattern = /^https:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::([0-9]{1,5}))?(?:[/?#][^\s\\<>"']*)?$/i;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' })[char]!,
  );

export const safeAttributionUrl = (raw = '') => {
  const value = raw.trim();
  const match = urlPattern.exec(value);
  if (!match || /[\x00-\x20\x7f-\x9f]/.test(value) || (match[1] && (+match[1] < 1 || +match[1] > 65535))) {
    return '';
  }
  return value;
};

export const attributionSettings = (settings: AttributionSettings): AttributionSettings => {
  const operator = (settings.FLEET_TENANT_NAME ?? '').trim();
  return {
    FLEET_TENANT_NAME: /[\x00-\x1f\x7f-\x9f]/.test(operator) ? '' : operator,
    FLEET_ABOUT_URL: safeAttributionUrl(settings.FLEET_ABOUT_URL),
    FLEET_SOURCE_URL: safeAttributionUrl(settings.FLEET_SOURCE_URL),
  };
};

export const renderAttribution = (slug: string, settings: AttributionSettings): string => {
  const {
    FLEET_TENANT_NAME: operator,
    FLEET_ABOUT_URL: fleet,
    FLEET_SOURCE_URL: source,
  } = attributionSettings(settings);
  const prefix = `Open-source software${operator ? ` run by ${operator},` : ''} built on `;
  if (slug === 'email-text') {
    return `This is ${prefix[0].toLowerCase()}${prefix.slice(1)}the Fleet${fleet ? ` (${fleet})` : ''}, open-source agentic software.${source ? ` Source: ${source}` : ''}`;
  }
  if (slug !== 'page' && slug !== 'email-html') {
    throw new Error('Unknown fleet-attribution slug');
  }
  return `${escape(prefix)}${fleet ? `<a href="${escape(fleet)}">the Fleet</a>` : 'the Fleet'}.${source ? ` <a href="${escape(source)}">Source</a>` : ''}`;
};

export const attributedEmail = (text: string, html: string | undefined, settings: AttributionSettings) => {
  const body = html ?? `<html><body><p>${escape(text).replace(/\n/g, '<br>')}</p></body></html>`;
  const footer = `<p style="margin:16px 0;font-size:12px;color:#585e6a">${renderAttribution('email-html', settings)}</p>`;
  const closing = /<\/body\s*>/i.exec(body);
  return {
    text: `${text.trimEnd()}\n\n${renderAttribution('email-text', settings)}`,
    html: closing ? body.slice(0, closing.index) + footer + body.slice(closing.index) : body + footer,
  };
};

let warned = false;
export const warnMissingSource = (settings: AttributionSettings) => {
  if (!safeAttributionUrl(settings.FLEET_SOURCE_URL) && !warned) {
    warned = true;
    console.warn('FLEET_SOURCE_URL is unset or invalid; configure the deployed commit URL for the AGPL source offer');
  }
};
