import { HttpError, json, withRoute } from "@/lib/auth/http";
import { rateLimit } from "@/lib/auth/rate-limit";
import { requireUser } from "@/lib/auth/session";
import { createApiToken } from "@/lib/auth/tokens";
import { MAX_ACTIVE_TOKENS, createTokenSchema } from "../_lib/clip";
import { parseBody } from "../_lib/parse";
import { countActiveTokens, listTokensForContext } from "../_lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRoute(async () => {
  const ctx = await requireUser();
  const tokens = await listTokensForContext(ctx);
  return json({ tokens });
});

export const POST = withRoute(async (req: Request) => {
  const ctx = await requireUser();
  const { name } = await parseBody(req, createTokenSchema, { maxBytes: 4 * 1024 });

  const limited = await rateLimit(`ext-token-create:${ctx.user.id}`, { limit: 20, windowSec: 3600 });
  if (!limited.ok) {
    throw new HttpError(429, "rate_limited", "You have created a lot of tokens in the last hour. Try again later.", {
      retryAfter: Math.ceil((limited.resetAt.getTime() - Date.now()) / 1000),
    });
  }

  const active = await countActiveTokens(ctx.workspace.id);
  if (active >= MAX_ACTIVE_TOKENS) {
    throw new HttpError(
      409,
      "conflict",
      `This workspace has ${MAX_ACTIVE_TOKENS} active tokens. Revoke one you no longer use, then create a new one.`,
    );
  }

  const { token, record } = await createApiToken({ workspaceId: ctx.workspace.id, userId: ctx.user.id, name });
  return json(
    {
      token,
      record: { ...record, mine: true, owner: { name: ctx.user.name, email: ctx.user.email } },
    },
    201,
  );
});
