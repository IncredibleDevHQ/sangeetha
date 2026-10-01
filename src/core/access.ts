export type Role = "owner" | "admin";
export type Capability = "workspace.read" | "team.manage" | "school.update";

const capabilities: Record<Role, readonly Capability[]> = {
  owner: ["workspace.read", "team.manage", "school.update"],
  admin: ["workspace.read"],
};
export function permits(role: Role, capability: Capability) {
  return capabilities[role].includes(capability);
}
export function isRecentAuth(authTime: number, now = Date.now()) {
  const age = now / 1000 - authTime;
  return Number.isFinite(age) && age >= -30 && age <= 300;
}
export function normalizePhone(input: string) {
  const compact = input.replace(/[\s()-]/g, "");
  const phone = /^\d{10}$/.test(compact) ? `+91${compact}` : compact;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Enter a valid phone number with its country code.");
  if (phone.startsWith("+91") && !/^\+91[6-9]\d{9}$/.test(phone)) throw new Error("Enter a valid Indian mobile number.");
  return phone;
}
export function normalizeDestination(channel: "email" | "phone", value: string) {
  if (channel === "phone") return normalizePhone(value);
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
  return email;
}
