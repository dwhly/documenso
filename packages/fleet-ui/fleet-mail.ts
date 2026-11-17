import { toPlainText } from '@react-email/render';
import type { Transporter } from 'nodemailer';

import { attributedEmail } from './fleet-attribution';

export const withFleetAttribution = <T extends Transporter>(transport: T): T => {
  transport.use('compile', (mail, callback) => {
    mail.resolveContent(mail.data, 'html', (htmlError, html) => {
      if (htmlError) {
        callback(htmlError);
        return;
      }
      mail.resolveContent(mail.data, 'text', (textError, text) => {
        if (textError) {
          callback(textError);
          return;
        }
        const body = html == null ? undefined : html.toString();
        Object.assign(
          mail.data,
          attributedEmail(text?.toString() ?? (body ? toPlainText(body) : ''), body, process.env),
        );
        callback();
      });
    });
  });
  return transport;
};
