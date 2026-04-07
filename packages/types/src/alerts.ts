import { z } from "zod";

/**
 * Comparison operators supported by alert threshold rules.
 */
export const alertOperators = ["gt", "lt", "gte", "lte", "eq"] as const;

/**
 * Notification channels through which alerts can be delivered.
 */
export const alertChannels = ["email", "webhook", "slack"] as const;

const alertOperatorEnum = z.enum(alertOperators);
const alertChannelEnum = z.enum(alertChannels);

/**
 * Schema for creating a new alert rule.
 *
 * When `deviceId` is omitted the rule applies org-wide.
 * `cooldownMinutes` prevents alert storms by suppressing re-notification
 * for the specified duration after the first trigger.
 */
export const createAlertRuleSchema = z.object({
  deviceId: z.string().uuid().optional(),
  name: z.string().min(1),
  metric: z.string(),
  operator: alertOperatorEnum,
  threshold: z.number(),
  channels: z.array(alertChannelEnum),
  cooldownMinutes: z.number().int().min(1).max(1440).default(15),
  enabled: z.boolean().default(true),
});

/**
 * Schema for updating an existing alert rule — all fields are optional.
 */
export const updateAlertRuleSchema = createAlertRuleSchema.partial();

export type AlertOperator = z.infer<typeof alertOperatorEnum>;
export type AlertChannel = z.infer<typeof alertChannelEnum>;
export type CreateAlertRuleInput = z.infer<typeof createAlertRuleSchema>;
export type UpdateAlertRuleInput = z.infer<typeof updateAlertRuleSchema>;
