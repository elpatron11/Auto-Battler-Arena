import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// The old ranked-view score spread could send a squad label back through
// profile autosave. Recover only known placeholder labels with historical
// evidence; never guess a player's name or touch their squad progression.
export async function repairArenaPlayerNames() {
  await db.execute(sql`
    WITH recovered AS (
      SELECT p.id, previous.opponent_name AS name
      FROM arena_profiles p
      CROSS JOIN LATERAL (
        SELECT n.opponent_name
        FROM arena_notifications n
        WHERE n.opponent_id = p.id AND n.type = 'arena'
          AND n.opponent_name NOT IN ('Saved squad', 'Current 3v3 squad', 'Current 2v2 squad')
          AND length(n.opponent_name) BETWEEN 2 AND 32
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_each(COALESCE(p.state->'squadRatings', '{}'::jsonb)) squad
            WHERE squad.value->>'name' = n.opponent_name
          )
        ORDER BY n.created_at DESC, n.id DESC
        LIMIT 1
      ) previous
      WHERE NOT p.is_bot
        AND p.name IN ('Saved squad', 'Current 3v3 squad', 'Current 2v2 squad')
    )
    UPDATE arena_profiles p
    SET name = recovered.name,
        state = jsonb_set(p.state, '{name}', to_jsonb(recovered.name))
    FROM recovered WHERE p.id = recovered.id
  `);
}