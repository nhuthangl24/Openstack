/* eslint-disable @typescript-eslint/no-explicit-any */

import { Telegraf, Markup } from "telegraf";
import * as dotenv from "dotenv";
import {
  generatePostCreateScript,
  createOpenStackVM,
  runCLI,
  escapeShellArg,
  extractIPv4,
} from "./src/lib/openstack";
import { flavors, formatFlavor, Flavor } from "./src/lib/flavors";
import { environments, Environment } from "./src/lib/environments";

dotenv.config({ path: ".env.local" });

const token = process.env.TELEGRAM_BOT_TOKEN!;
if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set in .env.local");

const bot = new Telegraf(token);

const DEFAULT_NETWORK = "public";

// ─── Session ───────────────────────────────────────────────────────────────
type State =
  | "IDLE"
  | "CREATE_NAME"
  | "CREATE_PASSWORD"
  | "CREATE_FLAVOR"
  | "CREATE_OS"
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
    os_name?: string;        // Image name to pass to lookupId
    environments?: string[];
    delete_target?: string;
    images_cache?: { id: string; name: string }[]; // temp cache for image selection
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
async function pollIP(serverName: string, maxAttempts = 30, intervalMs = 5000): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const cmd = `openstack server show ${escapeShellArg(serverName)} -c addresses -f value`;
      const stdout = await runCLI(cmd);
      const ip = extractIPv4(stdout);
      if (ip) return ip;
    } catch { /* keep polling */ }
  }
  return "";
}

function buildEnvKeyboard(selected: string[]) {
  const rows = environments.map((env: Environment) => {
    const checked = selected.includes(env.id) ? "✅ " : "☐ ";
    return [Markup.button.callback(`${checked}${env.label}`, `env_toggle_${env.id}`)];
  });
  rows.push([Markup.button.callback("➡️ Tiếp tục →", "env_done")]);
  return Markup.inlineKeyboard(rows);
}

// Format danh sách VM đẹp
async function formatVMList(): Promise<string> {
  const raw = await runCLI("openstack server list -f json");
  const list: any[] = JSON.parse(raw);
  if (list.length === 0) return "📭 Không có máy ảo nào.";

  const lines = list.map((vm: any) => {
    const name   = vm.Name   || vm.name   || "N/A";
    const status = vm.Status || vm.status || "N/A";
    const ip     = extractIPv4(vm.Networks ?? vm.networks);
    const flavor = vm.Flavor || vm.flavor || "—";
    const emoji  = status === "ACTIVE" ? "🟢" : status === "BUILD" ? "🟡" : status === "ERROR" ? "🔴" : "⚫";
    return (
      `${emoji} \`${name}\`\n` +
      `   💻 ${flavor} | 🌐 \`${ip || "N/A"}\` | ${status}`
    );
  });

  return `📋 *Danh sách máy ảo (${list.length}):*\n\n${lines.join("\n\n")}`;
}

// ─── /start ────────────────────────────────────────────────────────────────
bot.command("start", (ctx) => {
  resetSession(ctx.from.id);
  ctx.reply(
    "👋 *OpenStack VM Manager Bot*\n\n" +
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
    "*/create* — Tạo VM mới (wizard từng bước)\n" +
    "*/list*   — Xem tất cả VM + IP\n" +
    "*/delete* — Xóa một VM\n" +
    "*/cancel* — Hủy thao tác hiện tại\n\n" +
    "🔧 Các bước tạo VM:\n" +
    "1️⃣ Nhập tên\n" +
    "2️⃣ Nhập mật khẩu SSH\n" +
    "3️⃣ Chọn Flavor (CPU/RAM/Disk)\n" +
    "4️⃣ Chọn OS Image\n" +
    "5️⃣ Chọn môi trường cài sẵn\n" +
    "6️⃣ Xác nhận & tạo",
    { parse_mode: "Markdown" }
  );
});

bot.command("cancel", (ctx) => {
  resetSession(ctx.from.id);
  ctx.reply("❌ Đã hủy thao tác hiện tại.");
});

// ─── /list ─────────────────────────────────────────────────────────────────
bot.command("list", async (ctx) => {
  const msg = await ctx.reply("⏳ Đang tải danh sách máy ảo...");
  try {
    const text = await formatVMList();
    await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, text, {
      parse_mode: "Markdown",
    });
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
  const msg = await ctx.reply("⏳ Đang lấy danh sách VM...");
  try {
    const raw = await runCLI("openstack server list -f json");
    const list: any[] = JSON.parse(raw);

    if (list.length === 0) {
      await ctx.telegram.editMessageText(ctx.chat.id, msg.message_id, undefined, "📭 Không có VM nào để xóa.");
      return;
    }

    const buttons = list.map((vm: any) => {
      const name   = vm.Name   || vm.name   || "unknown";
      const status = vm.Status || vm.status || "";
      const emoji  = status === "ACTIVE" ? "🟢" : status === "BUILD" ? "🟡" : "⚫";
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

bot.action(/^delete_select_(.+)$/, async (ctx) => {
  const session = getSession(ctx.from!.id);
  session.data.delete_target = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `⚠️ *Xác nhận xóa máy ảo?*\n\n` +
    `🖥️ Tên: \`${ctx.match[1]}\`\n\n` +
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
    await ctx.editMessageText("❌ Không tìm thấy VM.");
    resetSession(ctx.from!.id);
    return;
  }
  await ctx.editMessageText(`⏳ Đang xóa \`${vmName}\`...`, { parse_mode: "Markdown" });
  try {
    await runCLI(`openstack server delete ${escapeShellArg(vmName)} --wait`);
    // Hiển thị danh sách cập nhật
    const listText = await formatVMList();
    await ctx.editMessageText(
      `✅ *Đã xóa \`${vmName}\` thành công!*\n\n${listText}`,
      { parse_mode: "Markdown" }
    );
  } catch (err: any) {
    await ctx.editMessageText(`❌ Xóa thất bại:\n\`${err.message}\``, { parse_mode: "Markdown" });
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
    "📝 *Bước 1/5:* Nhập tên máy ảo\n" +
    "_VD: web-server-01 — chỉ dùng chữ, số, dấu chấm, gạch ngang, gạch dưới_",
    { parse_mode: "Markdown" }
  );
});

// ─── Text handler ──────────────────────────────────────────────────────────
bot.on("text", async (ctx) => {
  const session = getSession(ctx.from.id);
  const text = ctx.message.text.trim();
  if (text.startsWith("/")) return;

  // Step 1: Name
  if (session.state === "CREATE_NAME") {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(text)) {
      ctx.reply(
        "❌ Tên không hợp lệ!\n" +
        "_Chỉ dùng chữ, số, dấu chấm, gạch ngang, gạch dưới. VD: web-01_",
        { parse_mode: "Markdown" }
      );
      return;
    }
    session.data.instance_name = text;
    session.state = "CREATE_PASSWORD";
    ctx.reply(
      "🔑 *Bước 2/5:* Nhập mật khẩu SSH\n" +
      "_Tối thiểu 8 ký tự. Dùng để đăng nhập ubuntu/root_",
      { parse_mode: "Markdown" }
    );
    return;
  }

  // Step 2: Password
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
    ctx.reply(
      "💻 *Bước 3/5:* Chọn cấu hình máy (Flavor):",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard(flavorButtons) }
    );
    return;
  }
});

// ─── Step 3: Flavor → Step 4: OS ───────────────────────────────────────────
bot.action(/^flavor_(.+)$/, async (ctx) => {
  const session = getSession(ctx.from!.id);
  if (session.state !== "CREATE_FLAVOR") {
    await ctx.answerCbQuery("⚠️ Phiên hết hạn, dùng /create lại.");
    return;
  }
  session.data.flavor = ctx.match[1];
  session.state = "CREATE_OS";
  await ctx.answerCbQuery();

  // Fetch images dynamically
  await ctx.editMessageText("⏳ Đang tải danh sách OS...");
  try {
    const raw = await runCLI("openstack image list --status active -f json");
    const images: any[] = JSON.parse(raw);
    const cache = images.map((img: any) => ({
      id:   img.ID   || img.id,
      name: img.Name || img.name || "Unknown",
    }));
    session.data.images_cache = cache;

    if (cache.length === 0) {
      await ctx.editMessageText("❌ Không tìm thấy image nào trong OpenStack.");
      resetSession(ctx.from!.id);
      return;
    }

    const buttons = cache.map((img, idx) => [
      Markup.button.callback(img.name, `os_${idx}`),
    ]);
    await ctx.editMessageText(
      "🐧 *Bước 4/5:* Chọn hệ điều hành (OS Image):",
      { parse_mode: "Markdown", ...Markup.inlineKeyboard(buttons) }
    );
  } catch (err: any) {
    await ctx.editMessageText(`❌ Lỗi tải OS: \`${err.message}\``, { parse_mode: "Markdown" });
    resetSession(ctx.from!.id);
  }
});

// ─── Step 4: OS → Step 5: Environments ────────────────────────────────────
bot.action(/^os_(\d+)$/, async (ctx) => {
  const session = getSession(ctx.from!.id);
  if (session.state !== "CREATE_OS") {
    await ctx.answerCbQuery("⚠️ Phiên hết hạn.");
    return;
  }
  const idx = parseInt(ctx.match[1], 10);
  const images = session.data.images_cache ?? [];
  const chosen = images[idx];
  if (!chosen) {
    await ctx.answerCbQuery("❌ Image không hợp lệ.");
    return;
  }
  session.data.os_name = chosen.name;
  session.state = "CREATE_ENVS";
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "🔧 *Bước 5/5:* Chọn môi trường cài sẵn\n_Bấm để bật/tắt, sau đó bấm Tiếp tục_",
    { parse_mode: "Markdown", ...buildEnvKeyboard(session.data.environments ?? []) }
  );
});

// ─── Step 5: Env toggles ───────────────────────────────────────────────────
bot.action(/^env_toggle_(.+)$/, async (ctx) => {
  const session = getSession(ctx.from!.id);
  if (session.state !== "CREATE_ENVS") {
    await ctx.answerCbQuery("⚠️ Phiên hết hạn.");
    return;
  }
  const envId = ctx.match[1];
  const sel = session.data.environments ?? [];
  const idx = sel.indexOf(envId);
  if (idx === -1) sel.push(envId); else sel.splice(idx, 1);
  session.data.environments = sel;
  await ctx.answerCbQuery(idx === -1 ? `✅ ${envId}` : `❌ Bỏ ${envId}`);
  await ctx.editMessageReplyMarkup(buildEnvKeyboard(sel).reply_markup as any);
});

// ─── Env done → Confirm ────────────────────────────────────────────────────
bot.action("env_done", async (ctx) => {
  const session = getSession(ctx.from!.id);
  if (session.state !== "CREATE_ENVS") {
    await ctx.answerCbQuery("⚠️ Phiên hết hạn.");
    return;
  }
  session.state = "CONFIRMING";
  await ctx.answerCbQuery();

  const { instance_name, password, flavor, os_name, environments: envs = [] } = session.data;
  const envList = envs.length > 0 ? envs.join(", ") : "_Không có_";

  await ctx.editMessageText(
    `📋 *Xác nhận tạo máy ảo:*\n\n` +
    `📝 Tên: \`${instance_name}\`\n` +
    `🔑 Mật khẩu: \`${password}\`\n` +
    `💻 Flavor: \`${flavor}\`\n` +
    `🐧 OS: \`${os_name}\`\n` +
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
    await ctx.answerCbQuery("⚠️ Phiên hết hạn.");
    return;
  }
  session.state = "CREATING";
  await ctx.answerCbQuery();
  await ctx.editMessageText("⏳ Đang tạo máy ảo, vui lòng chờ...");

  const { instance_name, password, flavor, os_name, environments: envs = [] } = session.data;

  const script = generatePostCreateScript(instance_name!, password!, envs);
  const result = await createOpenStackVM(
    {
      instance_name: instance_name!,
      password: password!,
      flavor: flavor!,
      os: os_name!,          // Tên image → lookupId sẽ resolve sang ID
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

  await ctx.editMessageText("✅ VM đã khởi tạo! ⏳ Đang chờ IP (tối đa 2 phút)...");

  const ip = await pollIP(instance_name!);
  const envList = envs.length > 0 ? envs.join(", ") : "Không có";

  // Lấy danh sách VM cập nhật
  let listText = "";
  try {
    listText = "\n\n" + (await formatVMList());
  } catch { /* ignore nếu lỗi */ }

  await ctx.editMessageText(
    `🎉 *TẠO MÁY ẢO THÀNH CÔNG!*\n\n` +
    `📝 Tên: \`${result.vm_name}\`\n` +
    `🆔 ID: \`${result.vm_id}\`\n` +
    `🐧 OS: \`${os_name}\`\n` +
    `💻 Flavor: \`${flavor}\`\n` +
    `🔧 Môi trường: ${envList}\n` +
    `🌐 IP: \`${ip || "Chưa lấy được — thử /list sau 1 phút"}\`\n\n` +
    `🔑 Mật khẩu: \`${password}\`\n` +
    `📟 SSH: \`ssh ubuntu@${ip || "<IP>"}\`\n` +
    `_Cloud-init đang cài đặt, thử SSH sau ~60 giây._` +
    listText,
    { parse_mode: "Markdown" }
  );

  resetSession(ctx.from!.id);
});

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
      "/create — Tạo VM\n" +
      "/list   — Danh sách VM\n" +
      "/delete — Xóa VM\n" +
      "/help   — Trợ giúp"
    );
  }
});

// ─── Launch ────────────────────────────────────────────────────────────────
bot.launch().then(() => {
  console.log("🤖 Telegram bot OpenStack VM Manager đang chạy...");
});
process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
