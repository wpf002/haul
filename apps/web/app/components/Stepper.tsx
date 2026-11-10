interface Props {
  value: number;
  onChange: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
}

export function Stepper({ value, onChange, label, min = 1, max = 99 }: Props) {
  return (
    <span className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </span>
  );
}
