/**
 * Reviews belonging to a LIVE establishment.
 *
 * `deleteEstablishment` is a SOFT delete — it stamps `establishment.deletedAt`
 * and deliberately leaves the reviews attached so support can undo within 30
 * days. But no review query filtered on it, so a deleted business kept
 * inflating every org-wide total: after deleting one business and re-linking
 * its Google listing to a new one, the dashboard read 856 reviews for a
 * 428-review listing (every rating bucket exactly doubled).
 *
 * Spread this into the `where` of any query that counts or lists reviews across
 * the whole org:
 *
 *   tx.review.count({ where: { ...LIVE_ESTABLISHMENT, rating: 5 } })
 *
 * Queries already scoped to ONE establishment id don't need it — the caller
 * has picked a live establishment.
 */
export const LIVE_ESTABLISHMENT = { establishment: { deletedAt: null } } as const;
