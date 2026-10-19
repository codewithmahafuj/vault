import { Search, X } from 'lucide-react';
import type { JSX } from 'react';

interface SearchFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly onChange: (value: string) => void;
}

export default function SearchField({
  id,
  label,
  value,
  placeholder,
  onChange,
}: SearchFieldProps): JSX.Element {
  return (
    <div className="search-field">
      <Search aria-hidden="true" />
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
      {value.length > 0 && (
        <button
          type="button"
          className="clear-button"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => onChange('')}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
