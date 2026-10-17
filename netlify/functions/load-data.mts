import { getDatabase } from "@netlify/database";
import { getUser } from "@netlify/identity";

export default async (req: Request) => {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const db = getDatabase();
  
  try {
    const potRes = await db.pool.query("SELECT data FROM pots WHERE user_id = $1", [user.id]);
    const histRes = await db.pool.query("SELECT data FROM history WHERE user_id = $1 ORDER BY entry_date DESC LIMIT 200", [user.id]);
    
    return Response.json({
      pot: potRes.rows.length > 0 ? potRes.rows[0].data : null,
      history: histRes.rows.map(r => r.data)
    });
  } catch (error) {
    return new Response("Load failed", { status: 500 });
  }
};
