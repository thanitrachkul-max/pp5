import type { IncomingMessage, ServerResponse } from "node:http";
import { createClient } from "@supabase/supabase-js";

const AUTH_EMAIL_DOMAIN = "ksp.gradebook";

type UserRole = "super_admin" | "admin" | "teacher" | "executive";

interface UpdateTeacherPayload {
  id?: unknown;
  username?: unknown;
  full_name?: unknown;
  title?: unknown;
  role?: unknown;
  password?: unknown;
  reset_password_to_username?: unknown;
}

const allowedRoles = new Set<UserRole>(["super_admin", "admin", "teacher", "executive"]);

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

function json(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable ${name}`);
  return value;
}

function parseRole(value: unknown): UserRole {
  const role = String(value || "teacher") as UserRole;
  if (!allowedRoles.has(role)) throw new Error("Invalid role");
  return role;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message;
  const message = String(error ?? "").trim();
  return message || "บันทึกไม่สำเร็จ";
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    const authorization = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!authorization) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }

    const supabaseUrl = getRequiredEnv("VITE_SUPABASE_URL");
    const anonKey = getRequiredEnv("VITE_SUPABASE_ANON_KEY");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const rawBody = await readRequestBody(req);
    const payload = JSON.parse(rawBody || "{}") as UpdateTeacherPayload;
    const id = String(payload.id ?? "").trim();
    const username = normalizeUsername(String(payload.username ?? ""));
    const fullName = String(payload.full_name ?? "").trim();
    const title = String(payload.title ?? "").trim() || null;
    const role = parseRole(payload.role);
    const newPassword = typeof payload.password === "string" ? payload.password.trim() : "";

    if (!id || !username || !fullName) {
      json(res, 400, { error: "กรอกข้อมูลไม่ครบ" });
      return;
    }

    if (newPassword && newPassword.length < 6) {
      json(res, 400, { error: "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร" });
      return;
    }

    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData.user) {
      json(res, 401, { error: "Unauthorized" });
      return;
    }

    const { data: adminProfile, error: adminError } = await supabaseUser
      .from("profiles")
      .select("role, school_id, is_active")
      .eq("id", authData.user.id)
      .single();

    if (adminError || adminProfile?.is_active !== true || !["super_admin", "admin"].includes(adminProfile?.role ?? "")) {
      json(res, 403, { error: "Forbidden" });
      return;
    }

    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from("profiles")
      .select("id, school_id, role")
      .eq("id", id)
      .single();

    if (targetError || !targetProfile) {
      json(res, 404, { error: "ไม่พบบัญชีผู้ใช้งาน" });
      return;
    }

    if (targetProfile.school_id !== adminProfile.school_id) {
      json(res, 403, { error: "Forbidden" });
      return;
    }

    if (
      (targetProfile.role === "super_admin" || role === "super_admin") &&
      adminProfile.role !== "super_admin"
    ) {
      json(res, 403, { error: "Only Super Admin can edit Super Admin accounts" });
      return;
    }

    const { data: usernameOwner, error: usernameError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .neq("id", id)
      .maybeSingle();

    if (usernameError) {
      json(res, 400, { error: usernameError.message });
      return;
    }

    if (usernameOwner) {
      json(res, 400, { error: "Username นี้ถูกใช้แล้ว" });
      return;
    }

    const authPayload: { email: string; password?: string; email_confirm?: boolean } = {
      email: usernameToAuthEmail(username),
      email_confirm: true,
    };

    if (newPassword) {
      authPayload.password = newPassword;
    } else if (payload.reset_password_to_username !== false) {
      authPayload.password = username;
    }

    const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(id, authPayload);
    if (authUpdateError) {
      json(res, 400, { error: authUpdateError.message });
      return;
    }

    const { error: profileUpdateError } = await supabaseAdmin
      .from("profiles")
      .update({
        username,
        full_name: fullName,
        title,
        role,
      })
      .eq("id", id);

    if (profileUpdateError) {
      json(res, 400, { error: profileUpdateError.message });
      return;
    }

    json(res, 200, { ok: true, id, username });
  } catch (error) {
    console.error("Update teacher account failed", error);
    json(res, 500, { error: getErrorMessage(error) });
  }
}
