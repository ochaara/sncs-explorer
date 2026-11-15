import { useEffect, useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  disabled?: boolean;
}

/**
 * Campo numérico que permite escribir libremente (p. ej. "0.") y solo
 * propaga valores válidos. Se sincroniza cuando el valor cambia desde fuera,
 * por ejemplo al arrastrar una línea del gráfico.
 */
export default function NumberField({ value, onChange, step = 0.001, min, max, digits = 3, disabled }: Props) {
  const [text, setText] = useState(value.toFixed(digits));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value.toFixed(digits));
  }, [value, digits, focused]);

  const commit = (raw: string) => {
    const v = Number(raw.replace(',', '.'));
    if (raw.trim() === '' || !Number.isFinite(v)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
    onChange(clamped);
  };

  return (
    <input
      type="number"
      className="number"
      inputMode="decimal"
      step={step}
      min={min}
      max={max}
      value={text}
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        setText(value.toFixed(digits));
      }}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
    />
  );
}
