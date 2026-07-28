export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const method = request.method;

        const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
            status,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });

        const getBody = async () => {
            try { return await request.json(); } catch { return {}; }
        };

        // POST /api/manox/register
        if (method === "POST" && url.pathname === "/api/manox/register") {
            const { username, userId } = await getBody();
            if (typeof username !== "string" || username.length < 1) {
                return jsonResponse({ success: false, message: "username inválido" }, 400);
            }
            const key = `user:${username.toLowerCase()}`;
            const userData = { username, userId: userId || null, lastSeen: Date.now() };
            await env.MANOX_KV.put(key, JSON.stringify(userData), { expirationTtl: 600 });
            return jsonResponse({ success: true });
        }

        // GET /api/manox/users
        if (method === "GET" && url.pathname === "/api/manox/users") {
            const activeUsers = [];
            const list = await env.MANOX_KV.list({ prefix: "user:" });
            for (const key of list.keys) {
                const val = await env.MANOX_KV.get(key.name, "json");
                if (val && (Date.now() - val.lastSeen <= 10 * 60 * 1000)) {
                    activeUsers.push(val.username);
                }
            }
            return jsonResponse({ success: true, users: activeUsers });
        }

        // POST /api/manox/heartbeat
        if (method === "POST" && url.pathname === "/api/manox/heartbeat") {
            const { username } = await getBody();
            if (typeof username !== "string") return jsonResponse({ success: false }, 400);

            const key = `user:${username.toLowerCase()}`;
            const oldData = await env.MANOX_KV.get(key, "json");
            if (oldData) {
                oldData.lastSeen = Date.now();
                await env.MANOX_KV.put(key, JSON.stringify(oldData), { expirationTtl: 600 });
            }
            return jsonResponse({ success: true });
        }

        return jsonResponse({ success: false, message: "Rota não encontrada" }, 404);
    }
};
