// src/middleware/auth.ts
import { NextFunction, Request, Response } from "express";
import * as jose from "jose";
import { PrismaClient } from "@prisma/client";


const prisma = new PrismaClient();

//cache JWKS per tenant 
const jwksCache = new Map<string, ReturnType<typeof jose.createRemoteJWKSet>>();

type AuthenticatedRequest = Request & {
  tenantId?: string;
  appId?: string;
  userId?: string;
  email?: string;
};

export const auth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
    
        // vérifier l'existence du token 
        const raw = req.headers.authorization?.replace(/^Bearer\s+/i, "");
        if (!raw) return res.status(401).json({ error: "missing_token" });

        //  decodage sans vérification pour lire les infos nécesaires à la récupération de la clé secrète
        const { payload, protectedHeader } = await jose.decodeJwt(raw) as unknown as {
            payload: jose.JWTPayload & { iss?: string; aud?: string; sub?: string; tenant_id?: string; app_id?: string; email?: string };
            protectedHeader: jose.JWSHeaderParameters & { kid?: string; alg?: string };
        };

        // vérifier si on a récupérer l'emetteur
        const iss = payload.iss;
        if (!iss) return res.status(401).json({ error: "missing_iss" });

        // récupérer la clé secrète à partir de l'emetteur
        const tenant = await prisma.tenant.findFirst({ 
            where: { issuer: iss },
            select: { id: true, name: true, alg: true, hsSecret: true, jwksUrl: true, audience: true }
        });

        if (!tenant) return res.status(401).json({ error: "invalid_iss" });

        const expectedAudience = tenant.audience
        const alg  = tenant.alg;

        let jwt: jose.JWTVerifyResult

        if (alg === "HS256") {

            if(!tenant.hsSecret) return res.status(401).json({ error: "tenant_has_no_hsSecret" });

            const key = new TextEncoder().encode(tenant.hsSecret)

            jwt = await jose.jwtVerify(raw, key, {
                issuer: iss,
                ...(expectedAudience ? { audience: expectedAudience } : {}),
                algorithms: ["HS256"],
                clockTolerance: "5s"
            });

        } else {

            if (!tenant.jwksUrl) return res.status(500).json({ error: "tenant_jwks_missing" });
            let jwks = jwksCache.get(tenant.jwksUrl);
            if (!jwks) {
                jwks = jose.createRemoteJWKSet(new URL(tenant.jwksUrl), { cooldownDuration: 60_000 });
                jwksCache.set(tenant.jwksUrl, jwks);
            }
            jwt = await jose.jwtVerify(raw, jwks, {
                algorithms: ["RS256"],
                issuer: iss,
                ...(expectedAudience ? { audience: expectedAudience } : {}),
                clockTolerance: "5s",
            });
        }

        // attacher les infos au req
        req.tenantId = (jwt.payload as any).tenant_id ?? tenant.id;
        req.appId = (jwt.payload as any).app_id;
        req.userId = jwt.payload.sub;
        req.email = (jwt.payload as any).email;

    } catch (err) {
        return res.status(401).json({ error: "invalid_token", message: err });
    }
}