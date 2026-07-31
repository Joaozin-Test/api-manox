export default {
    async fetch(request, env) {
        const SUPABASE_URL = env.SUPABASE_URL;
        const SUPABASE_KEY = env.SUPABASE_KEY;

        const headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        };

        const url = new URL(request.url);
        const method = request.method;

        const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

        const getBody = async () => { try { return await request.json(); } catch { return {}; } };
        const now = Date.now();

        // POST /api/manox/register
        if (method === "POST" && url.pathname === "/api/manox/register") {
            const { username, userId } = await getBody();
            if (!username || username.trim() === "") return jsonResponse({ success: false, message: "Username inválido" }, 400);

            const cleanUsername = username.trim();

            await fetch(`${SUPABASE_URL}/rest/v1/online_users`, {
                method: "POST",
                headers: { ...headers, "Prefer": "resolution=merge-duplicates" },
                body: JSON.stringify({ username: cleanUsername, user_id: userId || null, last_seen: now })
            });

            const getRes = await fetch(`${SUPABASE_URL}/rest/v1/stats?key=eq.total_executions`, { headers });
            const data = await getRes.json();

            let totalExecutions = 1;
            if (data && data.length > 0) {
                totalExecutions = parseInt(data[0].value, 10) + 1;
                await fetch(`${SUPABASE_URL}/rest/v1/stats?key=eq.total_executions`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ value: String(totalExecutions) })
                });
            } else {
                await fetch(`${SUPABASE_URL}/rest/v1/stats`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ key: "total_executions", value: "1" })
                });
            }

            return jsonResponse({ success: true, totalExecutions });
        }

        // POST /api/manox/heartbeat
        if (method === "POST" && url.pathname === "/api/manox/heartbeat") {
            const { username } = await getBody();
            if (!username) return jsonResponse({ success: false }, 400);

            await fetch(`${SUPABASE_URL}/rest/v1/online_users?username=eq.${encodeURIComponent(username.trim())}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ last_seen: now })
            });

            return jsonResponse({ success: true });
        }

        // GET /api/manox/users
        if (method === "GET" && url.pathname === "/api/manox/users") {
            const FIVE_MINUTES_AGO = now - (5 * 60 * 1000);

            const usersRes = await fetch(`${SUPABASE_URL}/rest/v1/online_users?last_seen=gt.${FIVE_MINUTES_AGO}`, { headers });
            const activeUsersData = await usersRes.json();
            const activeList = Array.isArray(activeUsersData) ? activeUsersData.map(u => u.username) : [];

            const statsRes = await fetch(`${SUPABASE_URL}/rest/v1/stats?key=eq.total_executions`, { headers });
            const statsData = await statsRes.json();
            const totalExecutions = (statsData && statsData.length > 0) ? parseInt(statsData[0].value, 10) : 0;

            return jsonResponse({
                success: true,
                onlineCount: activeList.length,
                users: activeList,
                totalExecutions
            });
        }

        return jsonResponse({ success: false, message: "Rota não encontrada" }, 404);
    }
};
