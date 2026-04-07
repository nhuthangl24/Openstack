import { Telegraf, Markup } from "telegraf";
import * as dotenv from "dotenv";
import {
  generatePostCreateScript,
  createOpenStackVM,
  runCLI,
  escapeShellArg,
} from "./src/lib/openstack";
import { flavors, formatFlavor, Flavor } from "./src/lib/flavors";
import { environments, Environment } from "./src/lib/environments";

dotenv.config({ path: ".env.local" });

const token = process.env.TELEGRAM_BOT_TOKEN!;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set in .env.local");

const bot = new Telegraf(token);

// ─── Fixed OS (Ubuntu 24.04) ───────────────────────────────────────────────
const DEFAULT_OS_ID   = "e463cada-459d-4a95-9fac-faeeb90817f3";
const DEFAULT_OS_NAME = "Ubuntu 24.04 Noble";
const DEFAULT_NETWORK = "public";

// ─── Session ───────────────────────────────────────────────────────────────
type State =
  | "IDLE"
  | "CREATE_NAME"
  | "CREATE_PASSWORD"
  | "CREATE_FLAVOR"
  | "CREATE_ENVS"
  | "CONFIRMING"
  | "CREATING"
  | "DELETE_CONFIRM";

interface Session {
  state: State;
  data: {
    instance_name?: string;
    password?: string;
    flavor?: string;
    environments?: string[];
    delete_target?: string; // vm name to delete
  };
}

const sessions = new Map<number, Session>();

function getSession(userId: number): Session {
  if (!sessions.has(userId)) sessions.set(userId, { state: "IDLE", data: {} });
  return sessions.get(userId)!;
}

function resetSession(userId: number) {
  sessions.set(userId, { state: "IDLE", data: {} });
}

// ─── Helpers ───────────────────────────────────────────────────────────────
async function pollIP(
  serverName: string,
  maxAttempts = 30,
  intervalMs = 5000
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const cmd = `openstack server show ${escapeShellArg(serverName)} -c addresses -f value`;
      const stdout = await runCLI(cmd);
      const m = stdout.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (m) return m[1];
    } catch {
      /* keep polling */
    }
  }
  return "";
}

// Build env toggle keyboard
function buildEnvKeyboard(selected: string[]) {
  const rows = environments.map((env: Environment) => {
    const checked = selected.includes(env.id) ? "✅ " : "";
    return [Markup.button.callback(`${checked}${env.label}`, `env_toggle_${env.id}`)];
  });
  rows.push([Markup.button.callback("➡️ Tiếp tục →", "env_done")]);
  return Markup.inlineKeyboard(rows);
}

// ─── /start ────────────────────────────────────────────────────────────────
bot.command("start", (ctx) => {
  resetSession(ctx.from.id);
  ctx.reply(
    "👋 *OpenStack VM Manager Bot*\n\n" +
    "Tôi có thể giúp bạn:\n" +
    "🖥️ /create — Tạo máy ảo mới\n" +
    "📋 /list   — Danh sách máy ảo\n" +
    "🗑️ /delete — Xóa máy ảo\n" +
    "❓ /help   — Trợ giúp",
    { parse_mode: "Markdown" }
  );
});

bot.command("help", (ctx) => {
  ctx.reply(
    "📖 *Hướng dẫn sử dụng*\n\n" +
    "*/create* — Bắt đầu wizard tạo VM mới\n" +
    "*/list*   — Xem tất cả VM đang chạy\n" +
    "*/delete* — Xóa một VM\n" +
    "*/cancel* — Hủy thao tác hiện tại\n\n" +
    "🔧 Các bước tạo VM:\n" +
    "1️⃣ Nhập tên máy ảo\n" +
    "2️⃣ Nhập mật khẩu SSH\n" +
    "3️⃣ Chọn cấu hình (Flavor)\n" +
    "4️⃣ Chọn môi trường cài đặt\n" +
    "5️⃣ Xác nhận & tạo",
    { parse_mode: "Markdown" }
  );
});

// ─── /cancel ───────────────────────────────────────────────────────────────
bot.command("cancel", (ctx) => {
  resetSession(ctx.from.id);
  ctx.reply("❌ Đã hủy thao tác hiện tại.");
});

// ─── /list ─────────────────────────────────────────────────────────────────
bot.command("list", async (ctx) => {
  const msg = await ctx.reply("⏳ Đang lấy danh sách máy ảo...");
  try {
    const raw = await runCLI("openstack server list -f json");
    const list: any[] = JSON.parse(raw);

    if (list.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, msg.message_id, undefined,
        "📭 Không có máy ảo nào."
      );
      return;
    }

    const lines = list.map((vm: any) => {
      const name    = vm.Name   || vm.name   || "N/A";
      const status  = vm.Status || vm.status || "N/A";
      const nets    = vm.Networks || vm.networks || "";
      const ipMatch = nets.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      const ip      = ipMatch ? ipMatch[1] : "—";
      const emoji   = status === "ACTIVE" ? "🟢" : status === "BUILD" ? "🟡" : "🔴";
      return `${emoji} \`${name}\`\n   Status: ${status} | IP: \`${ip}\``;
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id, msg.message_id, undefined,
      `📋 *Danh sách máy ảo (${list.length}):*\n\n${lines.join("\n\n")}`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, msg.message_id, undefined,
      `❌ Lỗi: \`${err.message}\``,
      { parse_mode: "Markdown" }
    );
  }
});

// ─── /delete ───────────────────────────────────────────────────────────────
bot.command("delete", async (ctx) => {
  const session = getSession(ctx.from.id);
  const msg = await ctx.reply("⏳ Đang lấy danh sách máy ảo...");
  try {
    const raw = await runCLI("openstack server list -f json");
    const list: any[] = JSON.parse(raw);

    if (list.length === 0) {
      await ctx.telegram.editMessageText(
        ctx.chat.id, msg.message_id, undefined,
        "📭 Không có máy ảo nào để xóa."
      );
      return;
    }

    const buttons = list.map((vm: any) => {
      const name   = vm.Name   || vm.name   || "unknown";
      const status = vm.Status || vm.status || "";
      const emoji  = status === "ACTIVE" ? "🟢" : status === "BUILD" ? "🟡" : "🔴";
      return [Markup.button.callback(`${emoji} ${name}`, `delete_select_${name}`)];
    });
    buttons.push([Markup.button.callback("❌ Hủy", "delete_cancel")]);

    session.state = "DELETE_CONFIRM";
    await ctx.telegram.editMessageText(
      ctx.chat.id, msg.message_id, undefined,
      "🗑️ *Chọn máy ảo muốn xóa:*",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }
    );
  } catch (err: any) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, msg.message_id, undefined,
      `❌ Lỗi: \`${err.message}\``,
      { parse_mode: "Markdown" }
    );
  }
});

// ─── delete_select_* ───────────────────────────────────────────────────────
bot.action(/^delete_select_(.+)$/, async (ctx) => {
  const session = getSession(ctx.from!.id);
  const vmName = ctx.match[1];
  session.data.delete_target = vmName;
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `⚠️ *Xác nhận xóa máy ảo?*\n\n` +
    `🖥️ Tên: \`${vmName}\`\n\n` +
    `Thao tác này *không thể hoàn tác!*`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🗑️ Xóa ngay", "delete_confirm")],
        [Markup.button.callback("❌ Hủy", "delete_cancel")],
      ]),
    }
  );
});

bot.action("delete_confirm", async (ctx) => {
  const session = getSession(ctx.from!.id);
  const vmName = session.data.delete_target;
  await ctx.answerCbQuery();
  if (!vmName) {
    await ctx.editMessageText("❌ Không tìm thấy VM để xóa.");
    resetSession(ctx.from!.id);
    return;
  }
  await ctx.editMessageText(`⏳ Đang xóa \`${vmName}\`...`, { parse_mode: "Markdown" });
  try {
    await runCLI(`openstack server delete ${escapeShellArg(vmName)} --wait`);
    await ctx.editMessageText(
      `✅ *Đã xóa máy ảo \`${vmName}\` thành công!*`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    await ctx.editMessageText(
      `❌ Xóa thất bại:\n\`${err.message}\``,
      { parse_mode: "Markdown" }
    );
  }
  resetSession(ctx.from!.id);
});

bot.action("delete_cancel", async (ctx) => {
  resetSession(ctx.from!.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText("❌ Đã hủy xóa.");
});

// ─── /create ───────────────────────────────────────────────────────────────
bot.command("create", (ctx) => {
  const session = getSession(ctx.from.id);
  session.state = "CREATE_NAME";
  session.data  = { environments: [] };
  ctx.reply(
    "🖥️ *Tạo máy ảo mới*\n\n" +
    "📝 Nhập tên máy ảo\n" +
    "_Chỉ dùng chữ, số, dấu chấm, gạch ngang, gạch dưới_\n" +
    "_Ví dụ: web-server-01_",
    { parse_mode: "Markdown" }
  );
});

// ─── Text handler ──────────────────────────────────────────────────────────
bot.on("text", async (ctx) => {
  const session = getSession(ctx.from.id);
  const text = ctx.message.text.trim();

  // Ignore commands
  if (text.startsWith("/")) return;

  // ── Step 1: Name ──
  if (session.state === "CREATE_NAME") {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(text)) {
      ctx.reply(
        "❌ Tên không hợp lệ!\n" +
        "Chỉ dùng chữ, số, dấu chấm, gạch ngang, gạch dưới.\n" +
        "_Ví dụ: web-server-01_",
        { parse_mode: "Markdown" }
      );
      return;
    }
    session.data.instance_name = text;
    session.state = "CREATE_PASSWORD";
    ctx.reply(
      "🔑 Nhập mật khẩu SSH\n" +
      "_Tối thiểu 8 ký tự. Dùng để đăng nhập `ubuntu@<IP>` và `root@<IP>`_",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // ── Step 2: Password ──
  if (session.state === "CREATE_PASSWORD") {
    if (text.length < 8) {
      ctx.reply("❌ Mật khẩu quá ngắn, cần ít nhất 8 ký tự:");
      return;
    }
    session.data.password = text;
    session.state = "CREATE_FLAVOR";

    const flavorButtons = flavors.map((f: Flavor) => [
      Markup.button.callback(formatFlavor(f), `flavor_${f.name}`),
    ]);
    ctx.reply("💻 Chọn cấu hình máy (Flavor):", Markup.inlineKeyboard(flavorButtons));
    return;
  }
});

// ─── Flavor selection ──────────────────────────────────────────────────────
bot.action(/^flavor_(.+)$/, async (ctx) => {
  const session = getSession(ctx.from!.id);
  if (session.state !== "CREATE_FLAVOR") {
    await ctx.answerCbQuery("⚠️ Phiên đã hết hạn, dùng /create lại.");
    return;
  }
  session.data.flavor = ctx.match[1];
  session.state = "CREATE_ENVS";
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    "🔧 *Chọn môi trường cài đặt:*\n_Bấm để bật/tắt, sau đó bấm Tiếp tục_",
    { parse_mode: "Markdown", ...buildEnvKeyboard(session.data.environments ?? []) }
  );
});

// ─── Env toggles ───────────────────────────────────────────────────────────
bot.action(/^env_toggle_(.+)$/, async (ctx) => {
  const session = getSession(ctx.from!.id);
  if (session.state !== "CREATE_ENVS") {
    await ctx.answerCbQuery("⚠️ Phiên đã hết hạn.");
    return;
  }
  const envId = ctx.match[1];
  const sel = session.data.environments ?? [];
  const idx = sel.indexOf(envId);
  if (idx === -1) sel.push(envId);
  else sel.splice(idx, 1);
  session.data.environments = sel;
  await ctx.answerCbQuery(idx === -1 ? `✅ Đã thêm ${envId}` : `❌ Đã bỏ ${envId}`);
  await ctx.editMessageReplyMarkup(
    buildEnvKeyboard(sel).reply_markup as any
  );
});

// ─── Env done → confirm ────────────────────────────────────────────────────
bot.action("env_done", async (ctx) => {
  const session = getSession(ctx.from!.id);
  if (session.state !== "CREATE_ENVS") {
    await ctx.answerCbQuery("⚠️ Phiên đã hết hạn.");
    return;
  }
  session.state = "CONFIRMING";
  await ctx.answerCbQuery();

  const { instance_name, password, flavor, environments: envs = [] } = session.data;
  const envList = envs.length > 0 ? envs.join(", ") : "_Không có_";

  await ctx.editMessageText(
    `📋 *Xác nhận tạo máy ảo:*\n\n` +
    `📝 Tên: \`${instance_name}\`\n` +
    `🔑 Mật khẩu: \`${password}\`\n` +
    `💻 Flavor: \`${flavor}\`\n` +
    `🐧 OS: ${DEFAULT_OS_NAME}\n` +
    `🌐 Network: ${DEFAULT_NETWORK}\n` +
    `🔧 Môi trường: ${envList}\n\n` +
    `Xác nhận tạo?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("✅ Tạo ngay", "confirm_create")],
        [Markup.button.callback("❌ Hủy", "cancel_create")],
      ]),
    }
  );
});

// ─── Confirm create ────────────────────────────────────────────────────────
bot.action("confirm_create", async (ctx) => {
  const session = getSession(ctx.from!.id);
  if (session.state !== "CONFIRMING") {
    await ctx.answerCbQuery("⚠️ Phiên đã hết hạn.");
    return;
  }
  session.state = "CREATING";
  await ctx.answerCbQuery();
  await ctx.editMessageText("⏳ Đang tạo máy ảo, vui lòng chờ...");

  const { instance_name, password, flavor, environments: envs = [] } = session.data;

  const script = generatePostCreateScript(instance_name!, password!, envs);
  const result = await createOpenStackVM(
    {
      instance_name: instance_name!,
      password: password!,
      flavor: flavor!,
      os: DEFAULT_OS_ID,
      network: DEFAULT_NETWORK,
      environments: envs,
    },
    script
  );

  if (!result.success) {
    await ctx.editMessageText(
      `❌ *Tạo thất bại:*\n\`${result.error}\``,
      { parse_mode: "Markdown" }
    );
    resetSession(ctx.from!.id);
    return;
  }

  await ctx.editMessageText(
    `✅ Máy ảo đã khởi tạo thành công!\n⏳ Đang chờ IP (có thể mất 1–2 phút)...`
  );

  const ip = await pollIP(instance_name!);

  const envList = envs.length > 0 ? envs.join(", ") : "Không có";

  await ctx.editMessageText(
    `🎉 *TẠO MÁY ẢO THÀNH CÔNG!*\n\n` +
    `📝 Tên: \`${result.vm_name}\`\n` +
    `🆔 ID: \`${result.vm_id}\`\n` +
    `🐧 OS: ${DEFAULT_OS_NAME}\n` +
    `💻 Flavor: \`${flavor}\`\n` +
    `🔧 Môi trường: ${envList}\n` +
    `🌐 IP: \`${ip || "Chưa lấy được — kiểm tra /list"}\`\n\n` +
    `🔑 Mật khẩu: \`${password}\`\n` +
    `📟 SSH: \`ssh ubuntu@${ip || "<IP>"}\`\n\n` +
    `_Cloud-init đang cài đặt, thử SSH sau ~60 giây._`,
    { parse_mode: "Markdown" }
  );

  resetSession(ctx.from!.id);
});

// ─── Cancel create ─────────────────────────────────────────────────────────
bot.action("cancel_create", async (ctx) => {
  resetSession(ctx.from!.id);
  await ctx.answerCbQuery();
  await ctx.editMessageText("❌ Đã hủy tạo máy ảo.");
});

// ─── Fallback ──────────────────────────────────────────────────────────────
bot.on("message", (ctx) => {
  const session = getSession(ctx.from!.id);
  if (session.state === "IDLE") {
    ctx.reply(
      "💡 Dùng các lệnh:\n" +
      "/create — Tạo VM mới\n" +
      "/list   — Danh sách VM\n" +
      "/delete — Xóa VM\n" +
      "/help   — Trợ giúp"
    );
  }
});

// ─── Launch ────────────────────────────────────────────────────────────────
bot.launch().then(() => {
  console.log("🤖 Telegram bot OpenStack VM Manager đang chạy...");
  console.log("📋 Lệnh: /start, /create, /list, /delete, /help, /cancel");
});
process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
