import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';

import { SignatureStylePicker, useSignatureStyle } from '../../../fleet-ui/signature-styles';
import { cn } from '../../lib/utils';

export type SignaturePadTypeProps = {
  className?: string;
  value?: string;
  defaultValue?: string;
  onChange: (_value: string) => void;
  onRender: (_value: string) => void;
};

export const SignaturePadType = ({ className, value, defaultValue, onChange, onRender }: SignaturePadTypeProps) => {
  const { t } = useLingui();
  const signatureStyle = useSignatureStyle(value ?? '', onRender);

  const $isDirty = useRef(false);

  useEffect(() => {
    if (!$isDirty.current && !value && defaultValue) {
      $isDirty.current = true;
      onChange(defaultValue);
    }
  }, [defaultValue, value, onChange]);

  return (
    <div className={cn('fleet-signature-type flex h-full w-full flex-col items-center justify-center', className)}>
      <input
        data-testid="signature-pad-type-input"
        aria-label={t`Type your signature`}
        placeholder={t`Type your signature`}
        className="w-full bg-transparent px-4 text-center font-signature text-7xl text-foreground placeholder:text-4xl focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
        style={{ fontFamily: signatureStyle.style }}
        value={value}
        onChange={(event) => {
          onChange(event.target.value.trimStart());
          $isDirty.current = true;
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />

      <SignatureStylePicker text={value ?? ''} {...signatureStyle} />
    </div>
  );
};
