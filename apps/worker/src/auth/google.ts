/**
 * Google OAuth 2.0 authorization code flow handler.
 * Exchanges auth codes for tokens, fetches user info, issues JWTs.
 */

import { signJWT } from "./jwt";
import type { Env } from "../types";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Build the Google OAuth consent URL.
 */
export function getGoogleAuthURL(env: Env): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: getCallbackURL(env),
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Handle the Google OAuth callback: exchange code → get user info → issue JWT → redirect to frontend.
 */
export async function handleGoogleCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectToFrontend(env, `?auth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return redirectToFrontend(env, "?auth_error=missing_code");
  }

  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: getCallbackURL(env),
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error("Token exchange failed:", errorBody);
      return redirectToFrontend(env, "?auth_error=token_exchange_failed");
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      id_token?: string;
    };

    // Fetch user info
    const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoResponse.ok) {
      return redirectToFrontend(env, "?auth_error=userinfo_failed");
    }

    const userInfo = (await userInfoResponse.json()) as GoogleUserInfo;

    // Create our own JWT
    const jwt = await signJWT(
      {
        sub: userInfo.id,
        name: userInfo.name,
        email: userInfo.email,
        picture: userInfo.picture,
      },
      env.JWT_SECRET
    );

    // Redirect to frontend with token
    return redirectToFrontend(env, `?token=${jwt}`);
  } catch (error) {
    console.error("OAuth callback error:", error);
    return redirectToFrontend(env, "?auth_error=internal_error");
  }
}

function getCallbackURL(env: Env): string {
  // Use the worker's own URL for the callback
  const workerBase =
    env.ENVIRONMENT === "production"
      ? `https://aidnd-worker.${env.CF_ACCOUNT_SUBDOMAIN || "workers"}.dev`
      : "http://localhost:8787";
  return `${workerBase}/api/auth/google/callback`;
}

function redirectToFrontend(env: Env, queryString: string): Response {
  const frontendUrl = env.FRONTEND_URL || "http://localhost:3000";
  return Response.redirect(`${frontendUrl}${queryString}`, 302);
}
