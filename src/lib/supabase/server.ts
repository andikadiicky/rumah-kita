export type AuthenticatedUser = {
  id: string;
};

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  return null;
}
