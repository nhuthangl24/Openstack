import { Telegraf, Markup } from "telegraf";
import * as dotenv from "dotenv";

// Nạp env từ process
dotenv.config();
dotenv.config({ path: ".env.local" });

import { generatePostCreateScript, createOpenStackVM, CreateVMData } from "./src/lib/openstack";
import { flavors, formatFlavor, Flavor } from "./src/lib/flavors";

const token = "7738703209:AAGwrpNkt0iu5136AHzUT5oIKP6GqQ6jn0I";

if (!token) {
  console.error("❌ Thiếu TELEGRAM_BOT_TOKEN trong file .env. Vui lòng bổ sung!");
  process.exit(1);
}

const bot = new Telegraf(token);

type SessionState = 'IDLE' | 'AWAITING_NAME' | 'AWAITING_PASSWORD';

interface UserSession {
  state: SessionState;
  data: Partial<CreateVMData>;
}

// In-memory session đơn giản
const sessions = new Map<number, UserSession>();

const getSession = (ctx: any): UserSession => {
  const id = ctx.chat.id;
  if (!sessions.has(id)) {
    sessions.set(id, { state: 'IDLE', data: {} });
  }
  return sessions.get(id)!;
};

// ----------------------------------------
// LỆNH CHÀO
// ----------------------------------------
bot.start((ctx) => {
  ctx.reply(
    "👋 Chào mừng Sếp tới với hệ thống tạo OpenStack VM từ xa!\n\n/create - Bắt đầu tạo 1 VM mới",
    Markup.keyboard([["/create"]]).resize()
  );
});

// ----------------------------------------
// LỆNH TẠO VM
// ----------------------------------------
bot.command("create", (ctx) => {
  const session = getSession(ctx);
  session.state = "AWAITING_NAME";
  session.data = {}; // Reset data
  
  ctx.reply("Dạ Sếp! Vui lòng nhập **Tên máy ảo** (VD: web01):", { parse_mode: "Markdown" });
});

// ----------------------------------------
// LẮNG NGHE TIN NHẮN
// ----------------------------------------
bot.on("text", async (ctx) => {
  const session = getSession(ctx);
  const text = ctx.message.text.trim();

  // Bỏ qua các tin nhắn /lệnh
  if (text.startsWith("/")) return;

  if (session.state === "AWAITING_NAME") {
    const nameRegex = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
    if (!nameRegex.test(text)) {
      await ctx.reply("❌ Tên máy không hợp lệ (chỉ gồm chữ, số, dấu chấm/gạch ngang). Vui lòng nhập lại:");
      return;
    }
    session.data.instance_name = text;
    session.state = "AWAITING_PASSWORD";
    await ctx.reply(`👉 Tên máy: ${text}\n🔑 Tiếp theo, mời Sếp nhập **Mật khẩu SSH** (tối thiểu 8 ký tự):`, { parse_mode: "Markdown" });
    return;
  }

  if (session.state === "AWAITING_PASSWORD") {
    if (text.length < 8) {
      await ctx.reply("❌ Mật khẩu quá ngắn, vui lòng nhập ít nhất 8 ký tự:");
      return;
    }
    session.data.password = text;
    session.state = "IDLE"; // Đã đủ thông tin cần thiết gõ tay

    // Chuyển sang chọn Flavor bằng Inline Keyboard
    const flavorButtons = flavors.map((f: Flavor) => [
      Markup.button.callback(formatFlavor(f), `flavor_${f.name}`)
    ]);

    await ctx.reply(
      "💻 Mời Sếp chọn cấu hình (Flavor):",
      Markup.inlineKeyboard(flavorButtons)
    );
    return;
  }
});

// ----------------------------------------
// LẮNG NGHE CHỌN INLINE KEYBOARD (FLAVOR)
// ----------------------------------------
bot.action(/flavor_(.*)/, async (ctx) => {
  const flavor = ctx.match[1];
  const session = getSession(ctx);

  if (!session.data.instance_name || !session.data.password) {
    await ctx.answerCbQuery("❌ Session hết hạn, vui lòng gõ /create để bắt đầu lại.");
    return;
  }

  session.data.flavor = flavor;
  session.data.os = "e463cada-459d-4a95-9fac-faeeb90817f3"; // Mặc định Ubuntu
  session.data.network = "public"; // Mặc định Public
  session.data.environments = []; // Mặc định không pre-install gì cho lẹ, có thể thêm sau nha

  await ctx.answerCbQuery(`Đã chọn: ${flavor}`);
  
  // Show nút Create Confirm
  await ctx.editMessageText(
    `✅ **XÁC NHẬN TẠO MÁY ẢO** ✅\n\n📌 Tên máy: \`${session.data.instance_name}\`\n💻 Cấu hình: \`${flavor}\`\n🐧 OS: \`Ubuntu 24.04\`\n\nVui lòng xác nhận tạo?`,
    {
      parse_mode: "Markdown",
      ...Markup.inlineKeyboard([
        [Markup.button.callback("🚀 Bấm Tạo Máy Vèo Vèo", "create_confirm")],
        [Markup.button.callback("✖️ Hủy", "create_cancel")]
      ])
    }
  );
});

bot.action("create_cancel", async (ctx) => {
  const session = getSession(ctx);
  session.state = "IDLE";
  session.data = {};
  await ctx.answerCbQuery("Đã hủy!");
  await ctx.editMessageText("❌ Đã hủy quá trình tạo VM.");
});

bot.action("create_confirm", async (ctx) => {
  const session = getSession(ctx);
  
  if (!session.data.instance_name) {
    await ctx.answerCbQuery("Lỗi!");
    return;
  }

  // Update messge sang "Đang xử lý"
  await ctx.editMessageText("⏳ Đang ra lệnh cấp phép OpenStack... Vui lòng chờ...");
  
  try {
    const { instance_name, password, flavor, os, network, environments } = session.data as CreateVMData;

    // Generate script (dùng logic API y hệt NextJS)
    const script = generatePostCreateScript(instance_name, password, environments);
    
    // Tạo qua hàm OpenStack
    const result = await createOpenStackVM({
      instance_name, password, flavor, os, network, environments
    }, script);

    if (result.success) {
      await ctx.editMessageText("✅ VM đã tạo xong! Đang chờ lấy IP...");

      // Poll IP
      let ip = "";
      const vmId = result.vm_id || "";
      if (vmId) {
        const openstackEnv = {
          OS_AUTH_URL: process.env.OS_AUTH_URL || "http://127.0.0.1/identity",
          OS_REGION_NAME: process.env.OS_REGION_NAME || "RegionOne",
          OS_USER_DOMAIN_ID: process.env.OS_USER_DOMAIN_ID || "default",
          OS_PROJECT_DOMAIN_ID: process.env.OS_PROJECT_DOMAIN_ID || "default",
          OS_AUTH_TYPE: process.env.OS_AUTH_TYPE || "password",
          OS_USERNAME: "dung",
          OS_PROJECT_NAME: "Dung_Prj",
          OS_PASSWORD: "mtdung2004",
        };
        for (let i = 0; i < 24 && !ip; i++) {
          await new Promise(r => setTimeout(r, 5000));
          try {
            const { stdout } = await import("child_process").then(({ exec }) =>
              new Promise<{ stdout: string; stderr: string }>((res, rej) =>
                exec(
                  `bash -c 'openstack server show ${JSON.stringify(instance_name)} -c addresses -f value'`,
                  {
                    timeout: 15000,
                    env: { ...process.env, OS_CLOUD: "", ...openstackEnv }
                  },
                  (err, stdout, stderr) => err ? rej(err) : res({ stdout, stderr })
                )
              )
            );
            const m = stdout.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
            if (m) ip = m[1];
          } catch {}
        }
      }

      await ctx.editMessageText(
        `🎉 **TẠO MÁY ẢO THÀNH CÔNG!** 🎉\n\n` +
        `📝 Tên máy: \`${result.vm_name}\`\n` +
        `🆔 ID: \`${result.vm_id}\`\n` +
        `☁️ Status: \`ACTIVE\`\n` +
        `🌐 IP: \`${ip || "Không lấy được IP, vui lòng check trên Dashboard"}\`\n\n` + 
        `🔑 Mật khẩu SSH: \`${password}\`\n` +
        `📟 Lệnh SSH: \`ssh ubuntu@${ip || "<IP>"}\`\n\n` +
        `_Cloud-init đang chạy background để set mật khẩu, SSH sau ~30 giây!_`,
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.editMessageText(`❌ **Tạo máy thất bại:**\n\n\`${result.error_message || result.error}\``, { parse_mode: "Markdown" });
    }
  } catch (err: any) {
    await ctx.editMessageText(`❌ **Sự cố bất ngờ:**\n\n\`${err.message}\``, { parse_mode: "Markdown" });
  }

  // Clear session
  session.state = "IDLE";
  session.data = {};
});

// Chạy bot
bot.launch().then(() => {
  console.log("🚀 Telegram Bot đang khởi chạy. Hãy chat với Bot trên Telegram!");
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
