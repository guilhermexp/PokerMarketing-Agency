import { z } from "zod";
import { idSchema, optionalNullableString, organizationIdSchema, userIdSchema } from "./common.js";

const tournamentEventSchema = z.object({
  day: z.string().trim().min(1),
  name: z.string().trim().min(1),
  game: optionalNullableString,
  gtd: optionalNullableString,
  buyIn: optionalNullableString,
  rebuy: optionalNullableString,
  addOn: optionalNullableString,
  stack: optionalNullableString,
  players: optionalNullableString,
  lateReg: optionalNullableString,
  minutes: optionalNullableString,
  structure: optionalNullableString,
  times: z.record(z.string(), z.string()).optional(),
  eventDate: optionalNullableString,
});

export const tournamentsListQuerySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
});

export type TournamentsListQuery = z.infer<typeof tournamentsListQuerySchema>;

export const tournamentsQuerySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  week_schedule_id: idSchema.optional(),
});

export type TournamentsQuery = z.infer<typeof tournamentsQuerySchema>;

export const tournamentsCreateBodySchema = z.object({
  user_id: userIdSchema,
  organization_id: organizationIdSchema,
  start_date: z.string().trim().min(1),
  end_date: z.string().trim().min(1),
  filename: optionalNullableString,
  events: z.array(tournamentEventSchema).optional(),
});

export type TournamentsCreateBody = z.infer<typeof tournamentsCreateBodySchema>;

export const tournamentsDeleteQuerySchema = z.object({
  id: idSchema,
  user_id: userIdSchema,
});

export type TournamentsDeleteQuery = z.infer<typeof tournamentsDeleteQuerySchema>;

export const tournamentEventFlyerQuerySchema = z.object({
  event_id: idSchema,
});

export type TournamentEventFlyerQuery = z.infer<typeof tournamentEventFlyerQuerySchema>;

export const tournamentEventFlyerBodySchema = z.object({
  flyer_url: optionalNullableString,
  flyer_urls: z.array(z.string().trim().min(1)).optional(),
  action: z.enum(["add", "remove", "set"]),
});

export type TournamentEventFlyerBody = z.infer<typeof tournamentEventFlyerBodySchema>;

export const tournamentDailyFlyerQuerySchema = z.object({
  schedule_id: idSchema,
  period: z.string().trim().min(1),
  day: z.string().trim().min(1).optional(),
});

export type TournamentDailyFlyerQuery = z.infer<typeof tournamentDailyFlyerQuerySchema>;

export const tournamentDailyFlyerBodySchema = z.object({
  flyer_url: optionalNullableString,
  flyer_urls: z.array(z.string().trim().min(1)).optional(),
  action: z.enum(["add", "remove", "set"]),
});

export type TournamentDailyFlyerBody = z.infer<typeof tournamentDailyFlyerBodySchema>;
