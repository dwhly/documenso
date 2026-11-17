import { AppError } from '@documenso/lib/errors/app-error';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useId, useRef, useState } from 'react';

export const useSignatureStyle = (text: string, onRender: (value: string) => void) => {
  const [style, setStyle] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const renderCallback = useRef(onRender);
  renderCallback.current = onRender;

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be disabled independently of signing permissions.
    }
    setStyle(SIGNATURE_STYLES.includes(saved ?? '') ? saved : 'Caveat');
  }, []);

  useEffect(() => {
    let isCurrent = true;
    renderCallback.current('');
    setHasError(false);
    if (!style || !text.trim()) {
      return;
    }
    if (style === 'Caveat') {
      renderCallback.current(text.trim());
      return;
    }
    void renderSignaturePng(text.trim(), style).then(
      (image) => {
        if (isCurrent) {
          renderCallback.current(image);
        }
      },
      () => {
        if (isCurrent) {
          setHasError(true);
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [text, style]);

  const selectStyle = (nextStyle: string) => {
    renderCallback.current('');
    setStyle(nextStyle);
    try {
      localStorage.setItem(STORAGE_KEY, nextStyle);
    } catch {
      // A blocked preference store must not prevent signing.
    }
  };

  return { style: style ?? 'Caveat', selectStyle, hasError };
};

export const SignatureStylePicker = ({ text, style, selectStyle, hasError }: SignatureStylePickerProps) => {
  const { t } = useLingui();
  const groupId = useId();
  return (
    <fieldset className="fleet-signature-styles">
      <legend className="sr-only">
        <Trans>Signature style</Trans>
      </legend>
      <div className="fleet-signature-styles__options">
        {SIGNATURE_STYLES.map((family) => (
          <label key={family} className="fleet-signature-styles__option">
            <input
              type="radio"
              name={groupId}
              value={family}
              checked={style === family}
              onChange={() => selectStyle(family)}
              aria-label={family}
            />
            <span className="fleet-signature-styles__preview" style={{ fontFamily: family }} aria-hidden="true">
              {text.trim() || t`Your name`}
            </span>
            <span className="fleet-signature-styles__name">{family}</span>
          </label>
        ))}
      </div>
      {hasError && (
        <p role="alert" className="fleet-signature-styles__error">
          <Trans>This style could not load. Choose another style or try again.</Trans>
        </p>
      )}
    </fieldset>
  );
};

export const renderSignaturePng = async (text: string, family: string, width = 1024, height = 448) => {
  const faces = await document.fonts.load(`128px "${family}"`, text);
  if (!faces.length || faces.some((face) => face.status !== 'loaded')) {
    throw new AppError('SIGNATURE_FONT_UNAVAILABLE');
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    throw new AppError('SIGNATURE_CANVAS_UNAVAILABLE');
  }
  context.font = `128px "${family}"`;
  const bounds = context.measureText(text);
  const inkWidth = bounds.actualBoundingBoxLeft + bounds.actualBoundingBoxRight;
  const inkHeight = bounds.actualBoundingBoxAscent + bounds.actualBoundingBoxDescent;
  if (inkWidth <= 0 || inkHeight <= 0) {
    throw new AppError('SIGNATURE_EMPTY');
  }
  // Fit the native 16:7 signature field, then trim to the ink bounds with an antialiasing gutter.
  const size = 128 * Math.min((width - 4) / inkWidth, (height - 4) / inkHeight);
  context.font = `${size}px "${family}"`;
  const fitted = context.measureText(text);
  canvas.width = Math.ceil(fitted.actualBoundingBoxLeft + fitted.actualBoundingBoxRight) + 4;
  canvas.height = Math.ceil(fitted.actualBoundingBoxAscent + fitted.actualBoundingBoxDescent) + 4;
  context.font = `${size}px "${family}"`;
  context.fillStyle = 'black';
  context.fillText(text, fitted.actualBoundingBoxLeft + 2, fitted.actualBoundingBoxAscent + 2);
  return canvas.toDataURL('image/png');
};

const STORAGE_KEY = 'sign.signature-style';
const SIGNATURE_STYLES = ['Caveat', 'Allura', 'Sacramento', 'Patrick Hand'];

type SignatureStylePickerProps = {
  text: string;
  style: string;
  selectStyle: (style: string) => void;
  hasError: boolean;
};
