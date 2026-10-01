import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/max";
export class InputError extends Error {}

export type Role = "owner" | "admin" | "member";
export type Capability = "workspace.read" | "team.manage" | "school.update";

const capabilities: Record<Role, readonly Capability[]> = {
  owner: ["workspace.read", "team.manage", "school.update"],
  admin: ["workspace.read"],
  member: ["workspace.read"],
};
export function permits(role: Role, capability: Capability) {
  return capabilities[role].includes(capability);
}
export function isRecentAuth(authTime: number, now = Date.now()) {
  const age = now / 1000 - authTime;
  return Number.isFinite(age) && age >= -30 && age <= 300;
}
export function normalizePhone(
  input: string,
  defaultCountry: CountryCode = "IN",
) {
  const number = parsePhoneNumberFromString(input.trim(), {
    defaultCountry,
    extract: false,
  });
  if (!number?.isValid() || number.ext)
    throw new InputError("Enter a valid phone number with its country code.");
  return number.number;
}
export function normalizeDestination(
  channel: "email" | "phone",
  value: string,
) {
  if (channel === "phone") return normalizePhone(value);
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
    throw new InputError("Enter a valid email address.");
  return email;
}
