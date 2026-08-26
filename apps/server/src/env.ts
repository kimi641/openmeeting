import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATA_DIR: z.string().default('./data'),
  SECRET_KEY: z.string().default('meeting-scheduler-dev-secret'),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
})

export const env = envSchema.parse(process.env)
