/**
 * Better Auth Client
 *
 * Client-side auth with React hooks and organization support.
 * Replaces @clerk/clerk-react.
 */

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: import.meta.env.DEV ? "http://localhost:3002" : window.location.origin,
  plugins: [organizationClient()],
});

export type Session = typeof authClient.$Infer.Session;

export interface OrganizationSummary {
  id: string;
  name: string;
}

export interface OrganizationCreateResult {
  data?: {
    id?: string;
  } | null;
  error?: {
    message?: string;
  } | null;
}

export interface OrganizationAcceptInvitationResult {
  data?: {
    member?: {
      organizationId?: string | null;
    } | null;
    organizationId?: string | null;
  } | null;
  error?: {
    message?: string;
  } | null;
}

export interface OrganizationMemberResult {
  data?: {
    members?: unknown[];
  } | unknown[] | null;
}

export interface OrganizationInvitationResult {
  data?: unknown[] | null;
}

export interface OrganizationInviteResult {
  data?: {
    id?: string;
  } | null;
}

export interface AuthOrganizationApi {
  create(input: { name: string; slug: string }): Promise<OrganizationCreateResult>;
  setActive(input: { organizationId: string | null }): Promise<unknown>;
  list(input: Record<string, never>): Promise<{ data?: OrganizationSummary[] | null }>;
  acceptInvitation(input: { invitationId: string }): Promise<OrganizationAcceptInvitationResult>;
  listMembers(input: { query: { organizationId: string } }): Promise<OrganizationMemberResult>;
  listInvitations(input: { query: { organizationId: string } }): Promise<OrganizationInvitationResult>;
  inviteMember(input: { organizationId: string; email: string; role: "member" | "admin" }): Promise<OrganizationInviteResult>;
  removeMember(input: { organizationId: string; memberIdOrEmail: string }): Promise<unknown>;
  updateMemberRole(input: { organizationId: string; memberId: string; role: "member" | "admin" }): Promise<unknown>;
  cancelInvitation(input: { invitationId: string }): Promise<unknown>;
}

export const getOrganizationApi = (): AuthOrganizationApi =>
  authClient.organization as unknown as AuthOrganizationApi;
