export type Me = {
  account: {
    displayName: string;
    identities: { provider: string; label: string }[];
    sessions: {
      id: string;
      device: string;
      createdAt: string;
      current: boolean;
    }[];
  };
  schools: {
    id: string;
    name: string;
    role: "owner" | "admin" | "member";
    timezone: string;
  }[];
};
export type Team = {
  members: {
    id: string;
    display_name: string;
    role: string;
    /** The sign-in email or phone, for people who haven't shared a name. */
    identity?: string | null;
  }[];
  invitations: {
    id: string;
    channel: string;
    destination: string;
    expires_at: string;
  }[];
};
