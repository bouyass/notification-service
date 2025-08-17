import type { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";

const ISSUER_BASE_URL = process.env.ISSUER_BASE_URL;

// cache JWKS par appId
const jwksByApp = new Map<string, ReturnType<typeof createRemoteJWKSet>>(); 

export type AuthRequest = Request & {
    tenantId?: string;
    appId?: string;
    userId?: string;
    email?: string;
};


export const auth = async (req: AuthRequest, res: Response, next: NextFunction) => {

    try {

        if (process.env.NODE_ENV === "test") {
            req.tenantId = "t1";
            req.appId = "app_a";
            req.userId = "user_test";
            return next();
        }

        // récupérer le token
        const raw = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
        if (!raw) return res.status(401).json({ message: "Missing token" });

        const hint = decodeJwt(raw);
        const iss = hint.iss as string | undefined;
        const appId = (hint.tenantId ?? hint.tenant_id) as string | undefined;
        const tenant_id = (hint.tenantId ?? hint.tenant_id) as string | undefined;

        if (!iss || !appId || !tenant_id) return res.status(401).json({ message: "Missing claims" });

        // JWKS distant fourni par l'issuer
        const jwksUrl = new URL(`/.well-known/jwks.json?appId=${encodeURIComponent(appId)}`, ISSUER_BASE_URL);
        let jwks = jwksByApp.get(appId);
        if (!jwks) {
            jwks = await createRemoteJWKSet(jwksUrl, { cooldownDuration: 60_000 });
            jwksByApp.set(appId, jwks);
            console.log('new jwks token for appId', appId, ' added  ', jwksUrl);
        }

        // verifier le token
        const { payload } = await jwtVerify(raw, jwks, {
            issuer: iss,
            audience: appId,
            algorithms: ["RS256"],
            clockTolerance: 60
        })

        // ajouter les infos de l'utilisateur
        req.tenantId = String(payload.tenantId ?? payload.tenant_id ?? tenant_id);
        req.appId = String(payload.appId ?? payload.app_id ?? appId);
        req.userId = String(payload.sub);
        req.email = (payload as any).email ?? undefined;

        return next()
    }
    catch (e) {
        console.error(e);
        return res.status(401).json({ message: "Unauthorized" });
    }

}
