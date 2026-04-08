import { z } from 'zod'
import { eq, asc } from 'drizzle-orm'
import { router, protectedProcedure } from '../init.js'
import { db } from '../../lib/db.js'
import * as schema from '@mikrotik/db/schema'

export const sitesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(schema.sites)
      .where(eq(schema.sites.orgId, ctx.org.id))
      .orderBy(asc(schema.sites.name))
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        location: z.string().optional(),
        latitude: z.string().optional(),
        longitude: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [site] = await db
        .insert(schema.sites)
        .values({ ...input, orgId: ctx.org.id })
        .returning()
      return site
    }),
})
