const activeUsersMap = new Map(); // Store { username_lowercase: { username, userId, lastSeen } }

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const method = request.method;

        const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
            status,
            headers: { 
                "Content-Type": "application/json", 
                "Access-Control-Allow-Origin": "*" 
            }
        });

        const getBody = async () => {
            try { return await request.json(); } catch { return {}; }
        };

        const now = Date.now();

        // Helper para limpar usuários inativos da RAM (mais de 10 minutos sem heartbeat)
        const cleanInactiveUsers = () => {
            const TEN_MINUTES = 10 * 60 * 1000;
            for (const [key, user] of activeUsersMap.entries()) {
                if (now - user.lastSeen > TEN_MINUTES) {
                    activeUsersMap.delete(key);
                }
            }
        };

        // --- REGISTRO / EXECUÇÃO DO SCRIPT ---
        if (method === "POST" && url.pathname === "/api/manox/register") {
            const { username, userId } = await getBody();

            if (typeof username !== "string" || username.length < 1) {
                return jsonResponse({ success: false, message: "username inválido" }, 400);
            }

            const userKey = username.toLowerCase().trim();

            // 1. Atualiza/Adiciona usuário ativo na memória RAM
            activeUsersMap.set(userKey, {
                username: username.trim(),
                userId: userId || null,
                lastSeen: now
            });

            // 2. Incrementa o Contador Total de Execuções NO KV
            // Usamos a chave "total_executions" no KV para salvar esse número
            let currentExecutions = await env.MANOX_KV.get("total_executions");
            let totalExecutions = currentExecutions ? parseInt(currentExecutions, 10) + 1 : 1;
            
            await env.MANOX_KV.put("total_executions", String(totalExecutions));

            return jsonResponse({ 
                success: true, 
                totalExecutions 
            });
        }

        // --- HEARTBEAT (MANTÉM O JOGADOR ONLINE NA RAM) ---
        if (method === "POST" && url.pathname === "/api/manox/heartbeat") {
            const { username } = await getBody();

            if (typeof username !== "string" || username.trim() === "") {
                return jsonResponse({ success: false, message: "username inválido" }, 400);
            }

            const userKey = username.toLowerCase().trim();

            if (activeUsersMap.has(userKey)) {
                const userData = activeUsersMap.get(userKey);
                userData.lastSeen = now;
                activeUsersMap.set(userKey, userData);
            }

            return jsonResponse({ success: true });
        }

        // --- RETORNA USUÁRIOS ATIVOS E ESTATÍSTICAS ---
        if (method === "GET" && url.pathname === "/api/manox/users") {
            cleanInactiveUsers(); // Remove inativos antes de responder

            const activeList = [];
            for (const user of activeUsersMap.values()) {
                activeList.push(user.username);
            }

            // Busca o total de execuções direto do KV
            const totalExecutions = await env.MANOX_KV.get("total_executions") || "0";

            return jsonResponse({ 
                success: true, 
                onlineCount: activeList.length, // Quantos jogadores estão usando agora
                users: activeList,              // Lista dos nomes online
                totalExecutions: parseInt(totalExecutions, 10) // Quantos executaram no total
            });
        }

        return jsonResponse({ success: false, message: "Rota não encontrada" }, 404);
    }
};
