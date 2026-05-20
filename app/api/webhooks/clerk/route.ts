/**
 * Clerk webhook — keeps public.users + public.companies in sync with Clerk.
 *
 * Configure in Clerk dashboard:
 *   URL:     https://<your-domain>/api/webhooks/clerk
 *   Events:  user.created, user.updated, user.deleted,
 *            organization.created, organization.updated, organization.deleted,
 *            organizationMembership.created, organizationMembership.updated,
 *            organizationMembership.deleted
 *   Secret:  copy "Signing Secret" into CLERK_WEBHOOK_SECRET
 *
 * Local dev: use `ngrok http 3000` (or `cloudflared tunnel`) to expose the
 * endpoint, then point Clerk at the public URL.
 */
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { supabase } from "@/lib/server/supabase";

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error("CLERK_WEBHOOK_SECRET not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const svixId = req.headers.get("svix-id");
  const svixTimestamp = req.headers.get("svix-timestamp");
  const svixSignature = req.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(secret);

  let event: WebhookEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Webhook signature invalid:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  try {
    await handleEvent(event);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response("Handler error", { status: 500 });
  }
}

async function handleEvent(event: WebhookEvent) {
  switch (event.type) {
    case "organization.created":
    case "organization.updated": {
      const org = event.data;
      await supabase
        .from("companies")
        .upsert(
          {
            clerk_org_id: org.id,
            name: org.name,
          },
          { onConflict: "clerk_org_id" }
        );
      break;
    }

    case "organization.deleted": {
      const orgId = event.data.id;
      if (!orgId) break;
      await supabase.from("companies").delete().eq("clerk_org_id", orgId);
      break;
    }

    case "user.created":
    case "user.updated": {
      const u = event.data;
      const email = u.email_addresses?.[0]?.email_address;
      const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || email || "Usuário";
      if (!email) break;

      // Apply to every (user, org) membership row we have for this Clerk user
      const { data: rows } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_user_id", u.id);

      if (rows && rows.length > 0) {
        await supabase
          .from("users")
          .update({ email, name })
          .eq("clerk_user_id", u.id);
      }
      // If user has no membership yet, the organizationMembership.created event
      // below creates the row.
      break;
    }

    case "user.deleted": {
      const userId = event.data.id;
      if (!userId) break;
      await supabase
        .from("users")
        .update({ is_active: false })
        .eq("clerk_user_id", userId);
      break;
    }

    case "organizationMembership.created":
    case "organizationMembership.updated": {
      const m = event.data;
      const clerkUserId = m.public_user_data?.user_id;
      const clerkOrgId = m.organization?.id;
      if (!clerkUserId || !clerkOrgId) break;

      // Look up local company by clerk_org_id (must exist — created via
      // organization.created webhook before this one fires)
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("clerk_org_id", clerkOrgId)
        .single();
      if (!company) {
        console.warn(`Membership for unknown org ${clerkOrgId}`);
        break;
      }

      const email = m.public_user_data?.identifier ?? "";
      const name = [m.public_user_data?.first_name, m.public_user_data?.last_name]
        .filter(Boolean)
        .join(" ") || email || "Usuário";

      // Map Clerk role to our local role (admin | analyst)
      const role = m.role === "org:admin" ? "admin" : "analyst";

      await supabase
        .from("users")
        .upsert(
          {
            clerk_user_id: clerkUserId,
            clerk_org_id: clerkOrgId,
            company_id: company.id,
            email,
            name,
            role,
            is_active: true,
          },
          { onConflict: "clerk_user_id,clerk_org_id" }
        );
      break;
    }

    case "organizationMembership.deleted": {
      const m = event.data;
      const clerkUserId = m.public_user_data?.user_id;
      const clerkOrgId = m.organization?.id;
      if (!clerkUserId || !clerkOrgId) break;
      await supabase
        .from("users")
        .update({ is_active: false })
        .eq("clerk_user_id", clerkUserId)
        .eq("clerk_org_id", clerkOrgId);
      break;
    }

    default:
      break;
  }
}
