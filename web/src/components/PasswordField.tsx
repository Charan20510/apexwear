import { useState } from "react";

interface PasswordFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete?: string;
}

// Shared eye-toggle password input — used by Register, Login, and reset-password.
export function PasswordField({ id, value, onChange, placeholder, autoComplete }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="authfield authfield--password">
      <input
        id={id}
        type={visible ? "text" : "password"}
        required
        minLength={8}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="authinput"
      />
      <button
        type="button"
        className="authfield__eye"
        aria-label={visible ? "Hide password" : "Show password"}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M3 3l18 18M10.58 10.58a2 2 0 0 0 2.83 2.83M9.36 5.3A10.94 10.94 0 0 1 12 5c5 0 9.27 3.11 11 7.5a12.7 12.7 0 0 1-3.22 4.6M6.4 6.6A12.8 12.8 0 0 0 1 12.5C2.73 16.89 7 20 12 20a11 11 0 0 0 3.16-.46"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M1 12.5C2.73 8.11 7 5 12 5s9.27 3.11 11 7.5C21.27 16.89 17 20 12 20S2.73 16.89 1 12.5z"
              fill="none"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12.5" r="3" fill="none" />
          </svg>
        )}
      </button>
    </div>
  );
}
