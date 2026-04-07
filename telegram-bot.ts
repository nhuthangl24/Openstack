import { Telegraf, Markup } from "telegraf";
import * as dotenv from "dotenv";
import { exec } from "child_process";
import { promisify } from "util";
import { generatePostCreateScript, createOpenStackVM, getOpenStackEnv, escapeShellArg } from "./src/lib/openstack";
import { flavors, formatFlavor, Flavor } from "./src/lib/flavors";

dotenv.config();
dotenv.config({ path: ".env.local" });

const execAsync = promisify(exec);
const token = process.env.TELEGRAM_BOT_TOKEN!;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set in .env.local");

const bot = new Telegraf(token);

// ─── Session store ─────────────────────────────────────────────────────────
interface Session {
  state: string;
  data: Record<string, any>;
}
const sessions = new Map<number, Session>();

function getSession(userId: number): Session {
  if (!sessions.has(userId)) sessions.set(userId, { state: "IDLE", data: {} });
  return sessions.get(userId)!;
}

// ─── Helper: Poll IP ────────────────────────────────────────────────────────
async function pollIP(serverName: string, maxAttempts = 24, intervalMs = 5000): Promise<string> {
  const env = getOpenStackEnv();
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    try {
      const cmd = `openstack server show ${escapeShellArg(serverName)} -c addresses -f value`;
      const { stdout } = await execAsync(`bash -c '${cmd}'`, {
        timeout: 15000,
        env: { ...process.env, OS_CLOUD: "", ...env },
      });
      const m = stdout.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (m) return m[1];
    } catch { /* keep polling */ }
  }
  return "";
}

// ─── /start ────────────────────────────────────────────────────────────────
bot.command("start", ctx => ctx.reply(
  "👋 Xin chào! Tôi là bot quản lý VM OpenStack.\n" +
  "Dùng /create để tạo máy ảo mới."
));

// ─── /create ───────────────────────────────────────────────────────────────
bot.command("create", ctx => {
  const session = getSession(ctx.from.id);
  session.state = "AWAITING_NAME";
  session.data = {};
  ctx.reply("📝 Nhập tên máy ảo (VD: web-server-01):");
});

// ─── Text handler ──────────────────────────────────────────────────────────
bot.on("text", async ctx => {
  const session = getSession(ctx.from.id);
  const text = ctx.message.text.trim();

  if (session.state === "AWAITING_NAME") {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(text)) {
      ctx.reply("❌ Tên không hợp lệ. Chỉ dùng chữ, số, dấu chấm, gạch ngang, gạch dưới.");
      return;
    }
    session.data.instance_name = text;
    session.state = "AWAITING_PASSWORD";
    ctx.reply("🔑 Nhập mật khẩu SSH (tối thiểu 8 ký tự):");
    return;
  }

  if (session.state === "AWAITING_PASSWORD") {
    if (text.length < 8) {
      ctx.reply("❌ Mật khẩu quá ngắn, cần ít nhất 8 ký tự:");
      return;
    }
    session.data.password = text;
    session.state = "AWAITING_FLAVOR";

    const flavorButtons = flavors.map((f: Flavor) => [
      Markup.button.callback(formatFlavor(f), `flavor_${f.name}`)
    ]);
    ctx.reply("💻 Chọn cấu hình máy (Flavor):", Markup.inlineKeyboard(flavorButtons));
    return;
  }
});

// ─── Flavor selection ──────────────────────────────────────────────────────
bot.action(/^flavor_(.+)$/, async ctx => {
  const session = getSession(ctx.from!.id);
  const flavorName = ctx.match[1];
  session.data.flavor = flavorName;
  session.state = "CONFIRMING";
  await ctx.answerCbQuery();

  const { instance_name, password, flavor } = session.data;
  await ctx.editMessageText(
    `📋 **Xác nhận tạo máy ảo:**\n\n` +
    `📝 Tên: \`${instance_name}\`\n` +
    `💻 Flavor: \`${flavor}\`\n` +
    `🐧 OS: Ubuntu 24.04 Noble\n` +
    `🌐 Network: public\n\n` +
    `Xác nhận tạo?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Tạo ngay", "confirm_create")],
        [Markup.button.callback("❌ Hủy", "cancel_create")],
      ])
    }
  );
});

// ─── Confirm create ────────────────────────────────────────────────────────
bot.action("confirm_create", async ctx => {
  const session = getSession(ctx.from!.id);
  session.state = "CREATING";
  await ctx.answerCbQuery();
  await ctx.editMessageText("⏳ Đang tạo máy ảo, vui lòng chờ...");

  const { instance_name, password, flavor } = session.data;

  const script = generatePostCreateScript(instance_name, password, []);
  const result = await createOpenStackVM({
    instance_name,
    password,
    flavor,
    os: "e463cada-459d-4a95-9fac-faeeb90817f3",
    network: "public",
    environments: [],
  }, script);

  if (!result.success) {
    await ctx.editMessageText(`❌ Tạo thất bại:\n\`${result.error}\``, { parse_mode: "Markdown" });
    session.state = "IDLE";
    return;
  }

  await ctx.editMessageText("✅ Máy ảo đã khởi tạo! Đang lấy IP...");

  const ip = await pollIP(instance_name);

  await ctx.editMessageText(
    `🎉 **TẠO MÁY ẢO THÀNH CÔNG!**\n\n` +
    `📝 Tên: \`${result.vm_name}\`\n` +
    `🆔 ID: \`${result.vm_id}\`\n` +
    `🌐 IP: \`${ip || "Chưa lấy được — kiểm tra dashboard"}\`\n\n` +
    `🔑 Mật khẩu: \`${password}\`\n` +
    `📟 SSH: \`ssh ubuntu@${ip || "<IP>"}\`\n\n` +
    `_Cloud-init đang cài đặt, thử SSH sau ~60 giây._`,
    { parse_mode: "Markdown" }
  );

  session.state = "IDLE";
});

// ─── Cancel ────────────────────────────────────────────────────────────────
bot.action("cancel_create", async ctx => {
  sessions.delete(ctx.from!.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText("❌ Đã hủy.");
});

// ─── Launch ────────────────────────────────────────────────────────────────
bot.launch().then(() => console.log("🤖 Telegram bot đang chạy..."));
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
