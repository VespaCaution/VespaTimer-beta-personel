import { getDatabase } from "@netlify/database";
import { getUser } from "@netlify/identity";

export default async (req: Request) => {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const db = getDatabase();
  const client = await db.pool.connect();

  try {
    const { pot, newHistoryEntries } = await req.json();
    await client.query("BEGIN");

    await client.query(
      "INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [user.id]
    );

    await client.query(
      `INSERT INTO pots (user_id, data, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [user.id, JSON.stringify(pot)]
    );

    if (newHistoryEntries && newHistoryEntries.length > 0) {
      for (const entry of newHistoryEntries) {
        await client.query(
          `INSERT INTO history (user_id, entry_date, data) VALUES ($1, $2, $3)`,
          [user.id, entry.date, JSON.stringify(entry)]
        );
      }
    }

    await client.query("COMMIT");
    return Response.json({ success: true });
  } catch (error) {
    await client.query("ROLLBACK");
    return new Response("Sync failed", { status: 500 });
  } finally {
    client.release();
  }
};
