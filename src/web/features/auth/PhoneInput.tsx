import { useState } from "react";
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
const names = new Intl.DisplayNames(["en"], { type: "region" });
const countries = getCountries().sort((a, b) =>
  (names.of(a) || a).localeCompare(names.of(b) || b),
);
/** Canonical international number is submitted; the country picker is only a dialing aid. */
export default function PhoneInput({
  label = "Mobile number",
  name,
  value,
  onChange,
  defaultValue = "",
  required = false,
}: {
  label?: string;
  name?: string;
  value?: string;
  onChange?: (value: string) => void;
  defaultValue?: string;
  required?: boolean;
}) {
  const [local, setLocal] = useState(defaultValue),
    current = value ?? local,
    [country, setCountry] = useState<CountryCode>(
      () => parsePhoneNumberFromString(current)?.country || "IN",
    );
  function change(next: string) {
    setLocal(next);
    onChange?.(next);
  }
  return (
    <div className="phone-input">
      <label>
        {label} country
        <select
          value={country}
          onChange={(e) => {
            const next = e.target.value as CountryCode,
              parsed = parsePhoneNumberFromString(current, {
                defaultCountry: country,
                extract: false,
              });
            setCountry(next);
            change(
              "+" +
                getCountryCallingCode(next) +
                (parsed?.nationalNumber || ""),
            );
          }}
        >
          {countries.map((c) => (
            <option value={c} key={c}>
              {names.of(c) || c} (+{getCountryCallingCode(c)})
            </option>
          ))}
        </select>
      </label>
      <label>
        {label}
        <input
          pattern={String.raw`\+[1-9][0-9 ]{6,24}`}
          type="tel"
          autoComplete="tel"
          name={name}
          required={required}
          value={current}
          onChange={(e) => change(e.target.value)}
          onBlur={() => {
            if (!current.trim()) return;
            const parsed = parsePhoneNumberFromString(current, {
              defaultCountry: country,
              extract: false,
            });
            if (parsed?.isValid()) {
              change(parsed.number);
              if (parsed.country) setCountry(parsed.country);
            }
          }}
          placeholder={"+" + getCountryCallingCode(country) + " …"}
        />
      </label>
      <small>
        Use the full number with its country code. You can paste any
        international number.
      </small>
    </div>
  );
}
