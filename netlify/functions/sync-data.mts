import { getDatabase } from "@netlify/database";
import { getUser } from "@netlify/identity";

export default async (req: Request) => {
  // 1. Authenticate
  const user = await getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const db = getDatabase();
  const client = await db.pool.connect();

  try {
    const payload = await req.json();
    const { pot, newHistoryEntries } = payload;

    // 2. Start Transaction (Ensures pot and history save together, or neither does)
    await client.query("BEGIN");

    // 3. Ensure user profile exists
    await client.query(
      "INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [user.id]
    );

    // 4. Upsert Current Pot
    await client.query(
      `INSERT INTO pots (user_id, data, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (user_id) DO UPDATE SET data = $2, updated_at = NOW()`,
      [user.id, JSON.stringify(pot)]
    );

    // 5. Sync History (Delete old, insert new)
    // We wipe the user's history and insert the full current list. 
    // This ensures deletions on the client are correctly reflected on the server.
    await client.query("DELETE FROM history WHERE user_id = $1", [user.id]);

    if (newHistoryEntries && Array.isArray(newHistoryEntries) && newHistoryEntries.length > 0) {
      // Bulk insert using unnest for maximum speed (handles thousands of rows instantly)
      const dates = newHistoryEntries.map(e => e.date);
      const dataArray = newHistoryEntries.map(e => JSON.stringify(e));
      const userIds = newHistoryEntries.map(() => user.id);

      await client.query(
        `INSERT INTO history (user_id, entry_date, data)
         SELECT * FROM unnest($1::text[], $2::timestamptz[], $3::jsonb[])`,
        [userIds, dates, dataArray]
      );
    }

    // 6. Commit Transaction
    await client.query("COMMIT");
    return Response.json({ success: true, syncedEntries: newHistoryEntries ? newHistoryEntries.length : 0 });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Sync failed:", error);
    return new Response("Sync failed", { status: 500 });
  } finally {
    client.release(); // Always release the connection back to the pool
  }
};
