const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

// ===================== CONFIG =====================
const TOKEN = process.env.TOKEN || 'YOUR_BOT_TOKEN';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';

// ===================== XP CONFIG =====================
const XP_PER_MESSAGE = { min: 15, max: 25 };
const XP_COOLDOWN_MS = 60 * 1000;
const XP_DB_PATH  = path.join(__dirname, 'xp.json');
const BG_DB_PATH  = path.join(__dirname, 'backgrounds.json');
const BG_DIR      = path.join(__dirname, 'backgrounds');

// Tạo thư mục backgrounds nếu chưa có
if (!fs.existsSync(BG_DIR)) fs.mkdirSync(BG_DIR);

// Level thưởng role: { level: 'tên role' }
const LEVEL_ROLE_REWARDS = {
  // 5:  'Member',
  // 10: 'Active',
  // 20: 'Legend',
};

// ===================== XP DATABASE =====================
function loadXP() {
  try { return JSON.parse(fs.readFileSync(XP_DB_PATH, 'utf8')); } catch { return {}; }
}
function saveXP(db) {
  fs.writeFileSync(XP_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}
function getUser(db, guildId, userId) {
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) db[guildId][userId] = { xp: 0, level: 0, totalMessages: 0, lastXP: 0 };
  return db[guildId][userId];
}

// ===================== BACKGROUND DATABASE =====================
function loadBG() {
  try { return JSON.parse(fs.readFileSync(BG_DB_PATH, 'utf8')); } catch { return {}; }
}
function saveBG(db) {
  fs.writeFileSync(BG_DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}
// Key: guildId_userId → path ảnh nền
function getUserBG(guildId, userId) {
  const db  = loadBG();
  const key = `${guildId}_${userId}`;
  return db[key] || null;
}
function setUserBG(guildId, userId, filePath) {
  const db  = loadBG();
  const key = `${guildId}_${userId}`;
  db[key]   = filePath;
  saveBG(db);
}

// ===================== XP MATH =====================
function xpForLevel(level) { return 5 * (level ** 2) + 50 * level + 100; }
function totalXPForLevel(level) {
  let total = 0;
  for (let i = 0; i < level; i++) total += xpForLevel(i);
  return total;
}
function calcLevel(totalXP) {
  let level = 0;
  while (totalXP >= totalXPForLevel(level + 1)) level++;
  return level;
}
function xpInCurrentLevel(totalXP, level) { return totalXP - totalXPForLevel(level); }

// ===================== CANVAS RANK CARD =====================
async function generateRankCard({ username, avatarURL, level, rank, totalRank, xpCurrent, xpNeeded, totalXP, totalMessages, bgPath }) {
  const W = 800, H = 250;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // --- Background ---
  let bgLoaded = false;
  if (bgPath && fs.existsSync(bgPath)) {
    try {
      const bg = await loadImage(bgPath);
      ctx.drawImage(bg, 0, 0, W, H);
      // overlay tối để dễ đọc chữ
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      bgLoaded = true;
    } catch {}
  }
  if (!bgLoaded) {
    // gradient mặc định
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(0.5, '#16213e');
    grad.addColorStop(1, '#0f3460');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // --- Viền ngoài bo tròn ---
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  roundRect(ctx, 4, 4, W - 8, H - 8, 20);
  ctx.stroke();

  // --- Avatar ---
  const avatarSize = 180;
  const avatarX    = 35;
  const avatarY    = (H - avatarSize) / 2;

  // Vẽ vòng tròn nền avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fill();
  ctx.restore();

  // Clip avatar thành tròn
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  try {
    const avatar = await loadImage(avatarURL + '?size=256');
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } catch {
    ctx.fillStyle = '#5865F2';
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }
  ctx.restore();

  // --- Vòng XP quanh avatar ---
  const cx = avatarX + avatarSize / 2;
  const cy = avatarY + avatarSize / 2;
  const r  = avatarSize / 2 + 10;
  const progress = xpCurrent / xpNeeded;

  // Nền vòng
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 6;
  ctx.stroke();

  // Vòng XP tiến độ
  const startAngle = -Math.PI / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, startAngle + Math.PI * 2 * progress);
  const xpGrad = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
  xpGrad.addColorStop(0, '#a855f7');
  xpGrad.addColorStop(1, '#06b6d4');
  ctx.strokeStyle = xpGrad;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  // --- Text bên phải ---
  const textX = avatarX + avatarSize + 30;

  // Username
  ctx.font = 'bold 36px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(truncate(ctx, username, 360), textX, 68);

  // Subtitle
  ctx.font = '18px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('An Bot User', textX, 95);

  // Stats row
  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#a855f7';
  ctx.fillText(`LVL ${level}`, textX, 140);

  ctx.font = '18px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Rank: #${rank}/${totalRank}`, textX + 100, 140);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(`Tin nhắn: ${totalMessages}`, textX + 280, 140);

  // XP text
  ctx.font = '16px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(`XP: ${xpCurrent.toLocaleString()} / ${xpNeeded.toLocaleString()}`, textX, 168);

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(`Tổng: ${totalXP.toLocaleString()} XP`, textX + 220, 168);

  // --- Thanh XP ngang ---
  const barX = textX, barY = 185, barW = 530, barH = 22, barR = 11;

  // Nền thanh
  roundRect(ctx, barX, barY, barW, barH, barR);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fill();

  // Thanh tiến độ
  const fillW = Math.max(barR * 2, barW * progress);
  roundRect(ctx, barX, barY, fillW, barH, barR);
  const barGrad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  barGrad.addColorStop(0, '#a855f7');
  barGrad.addColorStop(1, '#06b6d4');
  ctx.fillStyle = barGrad;
  ctx.fill();

  // % text trên thanh
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.floor(progress * 100)}%`, barX + fillW / 2, barY + 15);
  ctx.textAlign = 'left';

  // --- Level badge ---
  const badgeX = W - 80, badgeY = 15, badgeW = 65, badgeH = 28;
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 14);
  ctx.fillStyle = 'rgba(168,85,247,0.85)';
  ctx.fill();
  ctx.font = 'bold 15px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(`Lv.${level}`, badgeX + badgeW / 2, badgeY + 19);
  ctx.textAlign = 'left';

  return canvas.toBuffer('image/png');
}

// Helper: bo tròn rect
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Helper: cắt text nếu quá dài
function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  while (ctx.measureText(text + '…').width > maxW && text.length > 0) text = text.slice(0, -1);
  return text + '…';
}

// ===================== ADMINS =====================
function loadAdmins() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'admins.json'), 'utf8')).admins || []; }
  catch (e) { console.error('Không đọc được admins.json:', e.message); return []; }
}
function isAdmin(userId) { return loadAdmins().includes(userId); }

// ===================== EXPRESS =====================
const app = express();
app.get('/', (req, res) => res.send('Bot đang chạy!'));
app.listen(3000, () => console.log('Web server chạy tại port 3000'));

// ===================== DISCORD CLIENT =====================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

// ===================== SLASH COMMANDS =====================
const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Xem danh sach lenh'),
  new SlashCommandBuilder().setName('lock').setDescription('Khoa kenh hien tai (chi Admin)'),
  new SlashCommandBuilder().setName('unlock').setDescription('Mo khoa kenh hien tai (chi Admin)'),

  new SlashCommandBuilder().setName('role').setDescription('Them role cho user (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('Chon user').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Chon role muon them').setRequired(true)),

  new SlashCommandBuilder().setName('addroles').setDescription('Them nhieu role cho user cung luc (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('Chon user').setRequired(true))
    .addRoleOption(opt => opt.setName('role1').setDescription('Role 1').setRequired(true))
    .addRoleOption(opt => opt.setName('role2').setDescription('Role 2').setRequired(false))
    .addRoleOption(opt => opt.setName('role3').setDescription('Role 3').setRequired(false))
    .addRoleOption(opt => opt.setName('role4').setDescription('Role 4').setRequired(false))
    .addRoleOption(opt => opt.setName('role5').setDescription('Role 5').setRequired(false)),

  new SlashCommandBuilder().setName('deleterole').setDescription('Xoa role khoi user (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('Chon user').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Chon role muon xoa').setRequired(true)),

  new SlashCommandBuilder().setName('addrole').setDescription('Tao role moi trong server (chi Admin)')
    .addStringOption(opt => opt.setName('ten').setDescription('Ten cua role').setRequired(true))
    .addStringOption(opt => opt.setName('mau').setDescription('Mau hex VD: #FF0000').setRequired(true)),

  new SlashCommandBuilder().setName('clear').setDescription('Xoa tin nhan trong kenh (chi Admin)')
    .addIntegerOption(opt => opt.setName('soluong').setDescription('So tin nhan muon xoa (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder().setName('mute').setDescription('Cam user nhan tin (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('User can mute').setRequired(true))
    .addStringOption(opt => opt.setName('time').setDescription('Thoi gian VD: 10m, 1h, 2d').setRequired(true))
    .addStringOption(opt => opt.setName('lydo').setDescription('Ly do mute').setRequired(false)),

  new SlashCommandBuilder().setName('unmute').setDescription('Go mute user (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('User can unmute').setRequired(true)),

  new SlashCommandBuilder().setName('setrole').setDescription('Tao panel chon role bang nut bam (chi Admin)')
    .addStringOption(opt => opt.setName('tieude').setDescription('Tieu de panel').setRequired(true))
    .addRoleOption(opt => opt.setName('role1').setDescription('Role 1 (bat buoc)').setRequired(true))
    .addStringOption(opt => opt.setName('icon1').setDescription('Emoji cho role 1').setRequired(true))
    .addRoleOption(opt => opt.setName('role2').setDescription('Role 2').setRequired(false))
    .addStringOption(opt => opt.setName('icon2').setDescription('Emoji cho role 2').setRequired(false))
    .addRoleOption(opt => opt.setName('role3').setDescription('Role 3').setRequired(false))
    .addStringOption(opt => opt.setName('icon3').setDescription('Emoji cho role 3').setRequired(false))
    .addRoleOption(opt => opt.setName('role4').setDescription('Role 4').setRequired(false))
    .addStringOption(opt => opt.setName('icon4').setDescription('Emoji cho role 4').setRequired(false))
    .addRoleOption(opt => opt.setName('role5').setDescription('Role 5').setRequired(false))
    .addStringOption(opt => opt.setName('icon5').setDescription('Emoji cho role 5').setRequired(false))
    .addChannelOption(opt => opt.setName('kenh').setDescription('Kenh de bot gui panel role').setRequired(false))
    .addStringOption(opt => opt.setName('mota').setDescription('Mo ta them').setRequired(false)),

  // ===== RANK =====
  new SlashCommandBuilder().setName('rank').setDescription('Xem level và XP của bạn hoặc người khác')
    .addUserOption(opt => opt.setName('user').setDescription('Xem rank của ai? (mặc định là bạn)').setRequired(false)),

  // ===== TOP =====
  new SlashCommandBuilder().setName('top').setDescription('Bảng xếp hạng XP của server')
    .addIntegerOption(opt => opt.setName('trang').setDescription('Trang (mỗi trang 10 người)').setRequired(false).setMinValue(1)),

  // ===== SETBG =====
  new SlashCommandBuilder().setName('setbg').setDescription('Đổi ảnh nền rank card của bạn (đính kèm ảnh sau lệnh)')
    .addAttachmentOption(opt => opt.setName('anh').setDescription('Ảnh nền (JPG/PNG, tỉ lệ 16:9 đẹp nhất)').setRequired(true)),

  // ===== RESETBG =====
  new SlashCommandBuilder().setName('resetbg').setDescription('Xóa ảnh nền tùy chỉnh, dùng lại nền mặc định'),

  // ===== SETXP =====
  new SlashCommandBuilder().setName('setxp').setDescription('Dat XP cho user (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('Chon user').setRequired(true))
    .addIntegerOption(opt => opt.setName('xp').setDescription('So XP muon dat').setRequired(true).setMinValue(0)),

  // ===== RESETXP =====
  new SlashCommandBuilder().setName('resetxp').setDescription('Reset XP cua user ve 0 (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('Chon user').setRequired(true)),

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Da dang ky slash commands!');
  } catch (err) { console.error('Loi dang ky lenh:', err); }
});

// ===================== INTERACTION HANDLER =====================
client.on('interactionCreate', async (interaction) => {

  // ===== BUTTON: setrole =====
  if (interaction.isButton() && interaction.customId.startsWith('setrole_')) {
    try {
      const roleId = interaction.customId.replace('setrole_', '');
      const role   = interaction.guild.roles.cache.get(roleId);
      if (!role) return interaction.reply({ content: '❌ Role không tồn tại!', ephemeral: true });
      const member = interaction.member;
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(role);
        return interaction.reply({ content: `✅ Đã bỏ role **${role.name}**!`, ephemeral: true });
      } else {
        await member.roles.add(role);
        return interaction.reply({ content: `✅ Đã thêm role **${role.name}**!`, ephemeral: true });
      }
    } catch (err) { return interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
  }

  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, member, guild, channel } = interaction;

  // -------- /help --------
  if (commandName === 'help') {
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📋 Danh sách lệnh Bot')
      .addFields(
        { name: '👤 Lệnh mọi người', value: ['`.name [tên]` — Đổi nickname', '`/rank [@user]` hoặc `.rank` — 🏆 Xem rank card PNG', '`/top` hoặc `.top` — 🥇 Bảng xếp hạng', '`/setbg [ảnh]` hoặc `.setbg` — 🖼️ Đổi ảnh nền rank card', '`/resetbg` hoặc `.resetbg` — 🔄 Xóa ảnh nền tùy chỉnh'].join('\n') },
        { name: '🔐 Lệnh Admin', value: ['`/lock` `.lock` — 🔒 Khóa kênh', '`/unlock` `.unlock` — 🔓 Mở khóa kênh', '`/mute` `.mute` — 🔇 Mute thành viên', '`/unmute` `.unmute` — 🔊 Unmute', '`/role` `/addroles` `/deleterole` `/addrole` — Quản lý role', '`/clear` — 🧹 Xóa tin nhắn', '`/setrole` — 🎭 Panel chọn role', '`/setxp` `/resetxp` — ✏️ Quản lý XP'].join('\n') }
      ).setFooter({ text: 'Chỉ Admin mới dùng được lệnh có khóa 🔐' }).setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // -------- /lock --------
  if (commandName === 'lock') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels))
      return interaction.reply({ content: '❌ Bạn không có quyền khóa kênh!', ephemeral: true });
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, AddReactions: false, SendMessagesInThreads: false });
      interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('🔒 Kênh đã bị khóa').setDescription(`Kênh **#${channel.name}** đã bị khóa bởi ${user}`).setTimestamp()] });
    } catch (err) { interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
  }

  // -------- /unlock --------
  if (commandName === 'unlock') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels))
      return interaction.reply({ content: '❌ Bạn không có quyền mở khóa kênh!', ephemeral: true });
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null, AddReactions: null, SendMessagesInThreads: null });
      interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('🔓 Kênh đã được mở khóa').setDescription(`Kênh **#${channel.name}** đã được mở khóa bởi ${user}`).setTimestamp()] });
    } catch (err) { interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
  }

  // -------- /role --------
  if (commandName === 'role') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Bạn không có quyền thêm role!', ephemeral: true });
    const tu = interaction.options.getMember('user'), tr = interaction.options.getRole('role');
    if (!tu || !tr) return interaction.reply({ content: '❌ Không tìm thấy user hoặc role!', ephemeral: true });
    if (tu.roles.cache.has(tr.id)) return interaction.reply({ content: `❌ **${tu.user.username}** đã có role **${tr.name}** rồi!`, ephemeral: true });
    try {
      await tu.roles.add(tr);
      interaction.reply({ embeds: [new EmbedBuilder().setColor(tr.color || 0x5865F2).setTitle('✅ Đã thêm Role').setDescription(`Đã thêm role **${tr.name}** cho ${tu.user}\nThực hiện bởi: ${user}`).setTimestamp()] });
    } catch (err) { interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
  }

  // -------- /addroles --------
  if (commandName === 'addroles') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Bạn không có quyền thêm role!', ephemeral: true });
    const tu = interaction.options.getMember('user');
    if (!tu) return interaction.reply({ content: '❌ Không tìm thấy user!', ephemeral: true });
    const roles = []; for (let i = 1; i <= 5; i++) { const r = interaction.options.getRole(`role${i}`); if (r) roles.push(r); }
    if (!roles.length) return interaction.reply({ content: '❌ Chưa chọn role nào!', ephemeral: true });
    await interaction.deferReply();
    const added = [], skipped = [], failed = [];
    for (const r of roles) { if (tu.roles.cache.has(r.id)) skipped.push(r.name); else { try { await tu.roles.add(r); added.push(r.name); } catch { failed.push(r.name); } } }
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('➕ Kết quả thêm nhiều Role').setDescription(`Thành viên: ${tu.user}`).setTimestamp();
    if (added.length)   embed.addFields({ name: '✅ Đã thêm', value: added.map(r => `**${r}**`).join(', ') });
    if (skipped.length) embed.addFields({ name: '⏭️ Đã có', value: skipped.map(r => `**${r}**`).join(', ') });
    if (failed.length)  embed.addFields({ name: '❌ Thất bại', value: failed.map(r => `**${r}**`).join(', ') });
    interaction.editReply({ embeds: [embed] });
  }

  // -------- /deleterole --------
  if (commandName === 'deleterole') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Bạn không có quyền xóa role!', ephemeral: true });
    const tu = interaction.options.getMember('user'), tr = interaction.options.getRole('role');
    if (!tu || !tr) return interaction.reply({ content: '❌ Không tìm thấy user hoặc role!', ephemeral: true });
    if (!tu.roles.cache.has(tr.id)) return interaction.reply({ content: `❌ **${tu.user.username}** không có role **${tr.name}**!`, ephemeral: true });
    try { await tu.roles.remove(tr); interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🗑️ Đã xóa Role').setDescription(`Đã xóa role **${tr.name}** khỏi ${tu.user}\nThực hiện bởi: ${user}`).setTimestamp()] }); }
    catch (err) { interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
  }

  // -------- /addrole --------
  if (commandName === 'addrole') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Bạn không có quyền tạo role!', ephemeral: true });
    const rn = interaction.options.getString('ten'), rc = interaction.options.getString('mau');
    if (!/^#([0-9A-Fa-f]{6})$/.test(rc)) return interaction.reply({ content: '❌ Màu không hợp lệ! VD: `#FF0000`', ephemeral: true });
    if (guild.roles.cache.find(r => r.name.toLowerCase() === rn.toLowerCase())) return interaction.reply({ content: `❌ Role **${rn}** đã tồn tại!`, ephemeral: true });
    try {
      const nr = await guild.roles.create({ name: rn, color: rc, permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], reason: `Tao boi ${user.tag}` });
      interaction.reply({ embeds: [new EmbedBuilder().setColor(nr.color).setTitle('🎨 Đã tạo Role mới').addFields({ name: '📛 Tên', value: nr.name, inline: true }, { name: '🎨 Màu', value: rc, inline: true }).setTimestamp()] });
    } catch (err) { interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
  }

  // -------- /clear --------
  if (commandName === 'clear') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageMessages))
      return interaction.reply({ content: '❌ Bạn không có quyền xóa tin nhắn!', ephemeral: true });
    try {
      await interaction.deferReply({ ephemeral: true });
      const msgs = await channel.messages.fetch({ limit: interaction.options.getInteger('soluong') });
      const del  = msgs.filter(m => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
      if (!del.size) return interaction.editReply('❌ Không có tin nhắn nào xóa được!');
      await channel.bulkDelete(del, true);
      const reply = await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🧹 Đã xóa tin nhắn').setDescription(`Đã xóa **${del.size}** tin nhắn trong **#${channel.name}**`).setTimestamp()], ephemeral: false });
      setTimeout(() => reply.delete().catch(() => {}), 5000);
    } catch (err) { try { interaction.editReply({ content: `❌ Lỗi: ${err.message}` }); } catch {} }
  }

  // -------- /mute --------
  if (commandName === 'mute') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: '❌ Bạn không có quyền mute!', ephemeral: true });
    const tu = interaction.options.getMember('user'), ts = interaction.options.getString('time'), ly = interaction.options.getString('lydo') || 'Không có lý do';
    if (!tu) return interaction.reply({ content: '❌ Không tìm thấy user!', ephemeral: true });
    const ms = parseTime(ts);
    if (!ms) return interaction.reply({ content: '❌ Thời gian không hợp lệ! VD: `10m`, `1h`, `2d`', ephemeral: true });
    if (ms > 28*24*60*60*1000) return interaction.reply({ content: '❌ Tối đa 28 ngày!', ephemeral: true });
    try {
      await tu.timeout(ms, ly);
      interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🔇 Đã Mute').addFields({ name: '👤', value: `${tu.user}`, inline: true }, { name: '⏱️', value: formatTime(ms), inline: true }, { name: '📝 Lý do', value: ly }, { name: '🔓 Hết lúc', value: `<t:${Math.floor((Date.now()+ms)/1000)}:F>` }).setFooter({ text: `Bởi ${user.tag}` }).setTimestamp()] });
    } catch (err) { interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
  }

  // -------- /unmute --------
  if (commandName === 'unmute') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ModerateMembers))
      return interaction.reply({ content: '❌ Bạn không có quyền unmute!', ephemeral: true });
    const tu = interaction.options.getMember('user');
    if (!tu) return interaction.reply({ content: '❌ Không tìm thấy user!', ephemeral: true });
    if (!tu.communicationDisabledUntil) return interaction.reply({ content: `❌ **${tu.user.username}** không bị mute!`, ephemeral: true });
    try { await tu.timeout(null); interaction.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('🔊 Đã Unmute').setDescription(`${tu.user} được gỡ mute bởi ${user}`).setTimestamp()] }); }
    catch (err) { interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
  }

  // -------- /setrole --------
  if (commandName === 'setrole') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles))
      return interaction.reply({ content: '❌ Bạn không có quyền tạo panel role!', ephemeral: true });
    const tieude = interaction.options.getString('tieude'), mota = interaction.options.getString('mota') || '';
    const pairs  = []; for (let i = 1; i <= 5; i++) { const r = interaction.options.getRole(`role${i}`), ic = interaction.options.getString(`icon${i}`); if (r && ic) pairs.push({ role: r, icon: ic }); }
    if (!pairs.length) return interaction.reply({ content: '❌ Cần ít nhất 1 cặp role + icon!', ephemeral: true });
    const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(tieude).setDescription((mota ? mota + '\n\n' : '') + '**Click nút bên dưới để nhận/bỏ role:**\n' + pairs.map(p => `${p.icon} → **${p.role.name}**`).join('\n')).setFooter({ text: 'Click lần nữa để bỏ role' }).setTimestamp();
    const row = new ActionRowBuilder(); pairs.forEach(p => row.addComponents(new ButtonBuilder().setCustomId(`setrole_${p.role.id}`).setLabel(p.role.name).setEmoji(p.icon).setStyle(ButtonStyle.Primary)));
    const tc = interaction.options.getChannel('kenh') || channel;
    try {
      await tc.send({ embeds: [embed], components: [row] });
      await interaction.reply({ content: tc.id !== channel.id ? `✅ Đã gửi panel role sang ${tc}!` : '✅ Đã tạo panel role!', ephemeral: true });
    } catch (err) { interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true }); }
  }

  // ======================================================
  // -------- /rank --------
  // ======================================================
  if (commandName === 'rank') {
    await interaction.deferReply();
    const tm   = interaction.options.getMember('user') || member;
    const tu   = tm.user;
    const db   = loadXP();
    const data = getUser(db, guild.id, tu.id);
    const level     = calcLevel(data.xp);
    const xpNeeded  = xpForLevel(level);
    const xpCurrent = xpInCurrentLevel(data.xp, level);
    const gData  = db[guild.id] || {};
    const sorted = Object.entries(gData).map(([id, d]) => ({ id, xp: d.xp || 0 })).sort((a, b) => b.xp - a.xp);
    const rankPos = sorted.findIndex(e => e.id === tu.id) + 1;
    const bgPath  = getUserBG(guild.id, tu.id);

    try {
      const buffer = await generateRankCard({
        username: tm.displayName || tu.username,
        avatarURL: tu.displayAvatarURL({ extension: 'png' }),
        level, rank: rankPos, totalRank: sorted.length,
        xpCurrent, xpNeeded, totalXP: data.xp,
        totalMessages: data.totalMessages || 0,
        bgPath,
      });
      const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
      return interaction.editReply({ files: [attachment] });
    } catch (err) {
      return interaction.editReply({ content: `❌ Lỗi tạo rank card: ${err.message}` });
    }
  }

  // ======================================================
  // -------- /top --------
  // ======================================================
  if (commandName === 'top') {
    const page = (interaction.options.getInteger('trang') || 1) - 1;
    const db   = loadXP();
    const gData = db[guild.id] || {};
    const sorted = Object.entries(gData).map(([id, d]) => ({ id, xp: d.xp || 0, level: calcLevel(d.xp || 0) })).sort((a, b) => b.xp - a.xp);
    if (!sorted.length) return interaction.reply({ content: '❌ Chưa có ai có XP!', ephemeral: true });
    const totalPages = Math.ceil(sorted.length / 10);
    const pageData   = sorted.slice(page * 10, (page + 1) * 10);
    if (!pageData.length) return interaction.reply({ content: `❌ Không có dữ liệu trang ${page + 1}!`, ephemeral: true });
    const medals = ['🥇', '🥈', '🥉'];
    const lines = await Promise.all(pageData.map(async (e, i) => {
      const gr = page * 10 + i + 1, medal = medals[gr - 1] || `**#${gr}**`;
      let name = `<@${e.id}>`;
      try { const m = await guild.members.fetch(e.id).catch(() => null); if (m) name = m.displayName || m.user.username; } catch {}
      return `${medal} **${name}** — Lv.**${e.level}** | **${e.xp.toLocaleString()}** XP`;
    }));
    const embed = new EmbedBuilder().setColor(0xF1C40F).setTitle(`🏆 Bảng Xếp Hạng XP — ${guild.name}`).setDescription(lines.join('\n')).setFooter({ text: `Trang ${page + 1}/${totalPages} • ${sorted.length} thành viên` }).setTimestamp();
    return interaction.reply({ embeds: [embed] });
  }

  // ======================================================
  // -------- /setbg --------
  // ======================================================
  if (commandName === 'setbg') {
    await interaction.deferReply({ ephemeral: true });
    const attachment = interaction.options.getAttachment('anh');

    // Kiểm tra loại file
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(attachment.contentType)) {
      return interaction.editReply({ content: '❌ Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF!' });
    }

    // Kiểm tra kích thước (tối đa 8MB)
    if (attachment.size > 8 * 1024 * 1024) {
      return interaction.editReply({ content: '❌ Ảnh quá lớn! Tối đa 8MB.' });
    }

    try {
      // Tải ảnh về và lưu
      const https    = require('https');
      const http     = require('http');
      const ext      = attachment.contentType.includes('png') ? 'png' : attachment.contentType.includes('gif') ? 'gif' : attachment.contentType.includes('webp') ? 'webp' : 'jpg';
      const fileName = `${guild.id}_${user.id}.${ext}`;
      const filePath = path.join(BG_DIR, fileName);

      await new Promise((resolve, reject) => {
        const file   = fs.createWriteStream(filePath);
        const client = attachment.url.startsWith('https') ? https : http;
        client.get(attachment.url, (res) => {
          res.pipe(file);
          file.on('finish', () => { file.close(); resolve(); });
        }).on('error', (err) => { fs.unlink(filePath, () => {}); reject(err); });
      });

      setUserBG(guild.id, user.id, filePath);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('🖼️ Đã cập nhật ảnh nền rank card!')
        .setDescription('Dùng `/rank` để xem thành quả của bạn!')
        .setThumbnail(attachment.url)
        .setFooter({ text: 'Dùng /resetbg để xóa ảnh nền tùy chỉnh' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      return interaction.editReply({ content: `❌ Không tải được ảnh: ${err.message}` });
    }
  }

  // ======================================================
  // -------- /resetbg --------
  // ======================================================
  if (commandName === 'resetbg') {
    const bgPath = getUserBG(guild.id, user.id);
    if (!bgPath) return interaction.reply({ content: '❌ Bạn chưa có ảnh nền tùy chỉnh!', ephemeral: true });

    // Xóa file ảnh
    try { fs.unlinkSync(bgPath); } catch {}

    const db  = loadBG();
    delete db[`${guild.id}_${user.id}`];
    saveBG(db);

    const embed = new EmbedBuilder()
      .setColor(0xFF6600)
      .setTitle('🔄 Đã xóa ảnh nền tùy chỉnh')
      .setDescription('Rank card của bạn sẽ dùng nền gradient mặc định.\nDùng `/setbg` để đặt ảnh nền mới!')
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ======================================================
  // -------- /setxp --------
  // ======================================================
  if (commandName === 'setxp') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Bạn không có quyền set XP!', ephemeral: true });
    const tu = interaction.options.getMember('user'), newXP = interaction.options.getInteger('xp');
    if (!tu) return interaction.reply({ content: '❌ Không tìm thấy user!', ephemeral: true });
    const db = loadXP(), data = getUser(db, guild.id, tu.user.id);
    data.xp = newXP; saveXP(db);
    interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('✏️ Đã cập nhật XP').setDescription(`${tu.user} giờ có **${newXP.toLocaleString()}** XP (Level **${calcLevel(newXP)}**)\nBởi: ${user}`).setTimestamp()] });
  }

  // ======================================================
  // -------- /resetxp --------
  // ======================================================
  if (commandName === 'resetxp') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.Administrator))
      return interaction.reply({ content: '❌ Bạn không có quyền reset XP!', ephemeral: true });
    const tu = interaction.options.getMember('user');
    if (!tu) return interaction.reply({ content: '❌ Không tìm thấy user!', ephemeral: true });
    const db = loadXP(); if (db[guild.id]) delete db[guild.id][tu.user.id]; saveXP(db);
    interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🔄 Đã Reset XP').setDescription(`XP của ${tu.user} đã reset về **0**\nBởi: ${user}`).setTimestamp()] });
  }

});

// ===================== PREFIX COMMANDS =====================
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim();
  const member  = message.member;
  const guild   = message.guild;
  const channel = message.channel;

  // ===== XP SYSTEM =====
  const db   = loadXP();
  const data = getUser(db, guild.id, message.author.id);
  const now  = Date.now();

  if (now - data.lastXP >= XP_COOLDOWN_MS) {
    const xpGain   = Math.floor(Math.random() * (XP_PER_MESSAGE.max - XP_PER_MESSAGE.min + 1)) + XP_PER_MESSAGE.min;
    const oldLevel = calcLevel(data.xp);
    data.xp += xpGain;
    data.totalMessages = (data.totalMessages || 0) + 1;
    data.lastXP = now;
    const newLevel = calcLevel(data.xp);
    saveXP(db);

    if (newLevel > oldLevel) {
      const lvEmbed = new EmbedBuilder().setColor(0xF1C40F).setTitle('🎉 Lên Level!')
        .setDescription(`Chúc mừng ${message.author}! Bạn vừa lên **Level ${newLevel}**! 🚀`)
        .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
        .addFields({ name: '⭐ Level mới', value: `**${newLevel}**`, inline: true }, { name: '✨ Tổng XP', value: `**${data.xp.toLocaleString()}**`, inline: true })
        .setTimestamp();
      channel.send({ embeds: [lvEmbed] }).then(m => setTimeout(() => m.delete().catch(() => {}), 15000)).catch(() => {});

      if (LEVEL_ROLE_REWARDS[newLevel]) {
        const rr = guild.roles.cache.find(r => r.name === LEVEL_ROLE_REWARDS[newLevel]);
        if (rr && member && !member.roles.cache.has(rr.id)) member.roles.add(rr).catch(() => {});
      }
    }
  }

  // .name
  if (content.startsWith('.name ')) {
    const newName = content.slice(6).trim();
    if (!newName) return message.reply('❌ Vui lòng nhập tên! VD: `.name TênMới`');
    if (newName.length > 32) return message.reply('❌ Tên quá dài! Tối đa 32 ký tự.');
    try { await member.setNickname(newName); message.reply(`✅ Đã đổi nickname thành **${newName}**!`); }
    catch { message.reply('❌ Không thể đổi tên! Bot cần role cao hơn bạn.'); }
  }

  // .lock / .unlock
  if (content === '.lock') {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Không có quyền!');
    try { await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false, AddReactions: false, SendMessagesInThreads: false }); channel.send({ embeds: [new EmbedBuilder().setColor(0xFF0000).setTitle('🔒 Kênh đã bị khóa').setDescription(`Khóa bởi ${message.author}`).setTimestamp()] }); }
    catch (err) { message.reply(`❌ Lỗi: ${err.message}`); }
  }
  if (content === '.unlock') {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) return message.reply('❌ Không có quyền!');
    try { await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: null, AddReactions: null, SendMessagesInThreads: null }); channel.send({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('🔓 Kênh đã được mở khóa').setDescription(`Mở khóa bởi ${message.author}`).setTimestamp()] }); }
    catch (err) { message.reply(`❌ Lỗi: ${err.message}`); }
  }

  // .mute / .unmute
  if (content.startsWith('.mute ')) {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Không có quyền!');
    const args = content.split(/\s+/), mid = args[1]?.replace(/[<@!>]/g, ''), ts = args[2], ly = args.slice(3).join(' ') || 'Không có lý do';
    if (!mid || !ts) return message.reply('❌ Cú pháp: `.mute @user [time] [lý do]`');
    const ms = parseTime(ts); if (!ms) return message.reply('❌ Thời gian không hợp lệ!');
    if (ms > 28*24*60*60*1000) return message.reply('❌ Tối đa 28 ngày!');
    try {
      const tm = await guild.members.fetch(mid).catch(() => null); if (!tm) return message.reply('❌ Không tìm thấy user!');
      await tm.timeout(ms, ly);
      message.reply({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🔇 Đã Mute').addFields({ name: '👤', value: `${tm.user}`, inline: true }, { name: '⏱️', value: formatTime(ms), inline: true }, { name: '📝', value: ly }, { name: '🔓 Hết lúc', value: `<t:${Math.floor((Date.now()+ms)/1000)}:F>` }).setFooter({ text: `Bởi ${message.author.tag}` }).setTimestamp()] });
    } catch (err) { message.reply(`❌ Lỗi: ${err.message}`); }
  }
  if (content.startsWith('.unmute ')) {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ModerateMembers)) return message.reply('❌ Không có quyền!');
    const mid = content.split(/\s+/)[1]?.replace(/[<@!>]/g, '');
    if (!mid) return message.reply('❌ Cú pháp: `.unmute @user`');
    try {
      const tm = await guild.members.fetch(mid).catch(() => null); if (!tm) return message.reply('❌ Không tìm thấy user!');
      if (!tm.communicationDisabledUntil) return message.reply(`❌ **${tm.user.username}** không bị mute!`);
      await tm.timeout(null); message.reply({ embeds: [new EmbedBuilder().setColor(0x00FF00).setTitle('🔊 Đã Unmute').setDescription(`${tm.user} được gỡ mute bởi ${message.author}`).setTimestamp()] });
    } catch (err) { message.reply(`❌ Lỗi: ${err.message}`); }
  }

  // ======================================================
  // .rank [@user]
  // ======================================================
  if (content === '.rank' || content.startsWith('.rank ')) {
    let tm = member;
    const mid = content.split(/\s+/)[1]?.replace(/[<@!>]/g, '');
    if (mid) tm = await guild.members.fetch(mid).catch(() => null) || member;
    const tu = tm.user;
    const xpDb  = loadXP(), xpData = getUser(xpDb, guild.id, tu.id);
    const level = calcLevel(xpData.xp), xpNeeded = xpForLevel(level), xpCurrent = xpInCurrentLevel(xpData.xp, level);
    const gData = xpDb[guild.id] || {}, sorted = Object.entries(gData).map(([id, d]) => ({ id, xp: d.xp||0 })).sort((a,b)=>b.xp-a.xp);
    const rankPos = sorted.findIndex(e => e.id === tu.id) + 1;
    const bgPath  = getUserBG(guild.id, tu.id);

    const loadingMsg = await message.reply('⏳ Đang tạo rank card...');
    try {
      const buffer = await generateRankCard({
        username: tm.displayName || tu.username,
        avatarURL: tu.displayAvatarURL({ extension: 'png' }),
        level, rank: rankPos, totalRank: sorted.length,
        xpCurrent, xpNeeded, totalXP: xpData.xp,
        totalMessages: xpData.totalMessages || 0,
        bgPath,
      });
      await loadingMsg.delete().catch(() => {});
      message.reply({ files: [new AttachmentBuilder(buffer, { name: 'rank.png' })] });
    } catch (err) {
      await loadingMsg.delete().catch(() => {});
      message.reply(`❌ Lỗi tạo rank card: ${err.message}`);
    }
  }

  // ======================================================
  // .top [trang]
  // ======================================================
  if (content === '.top' || content.startsWith('.top ')) {
    const page = (parseInt(content.split(/\s+/)[1]) || 1) - 1;
    const xpDb = loadXP(), gData = xpDb[guild.id] || {};
    const sorted = Object.entries(gData).map(([id, d]) => ({ id, xp: d.xp||0, level: calcLevel(d.xp||0) })).sort((a,b)=>b.xp-a.xp);
    if (!sorted.length) return message.reply('❌ Chưa có ai có XP!');
    const totalPages = Math.ceil(sorted.length / 10), pageData = sorted.slice(page*10, (page+1)*10);
    if (!pageData.length) return message.reply(`❌ Không có dữ liệu trang ${page+1}!`);
    const medals = ['🥇','🥈','🥉'];
    const lines = await Promise.all(pageData.map(async (e, i) => {
      const gr = page*10+i+1, medal = medals[gr-1]||`**#${gr}**`;
      let name = `<@${e.id}>`; try { const m = await guild.members.fetch(e.id).catch(()=>null); if(m) name=m.displayName||m.user.username; } catch {}
      return `${medal} **${name}** — Lv.**${e.level}** | **${e.xp.toLocaleString()}** XP`;
    }));
    message.reply({ embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle(`🏆 Bảng Xếp Hạng XP — ${guild.name}`).setDescription(lines.join('\n')).setFooter({ text: `Trang ${page+1}/${totalPages} • ${sorted.length} thành viên` }).setTimestamp()] });
  }

  // ======================================================
  // .setbg — đính kèm ảnh kèm theo tin nhắn
  // ======================================================
  if (content === '.setbg' || content.startsWith('.setbg')) {
    const attachment = message.attachments.first();
    if (!attachment) {
      return message.reply('❌ Vui lòng đính kèm ảnh cùng lệnh!\nVD: gõ `.setbg` rồi đính kèm ảnh vào cùng 1 tin nhắn.');
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(attachment.contentType)) return message.reply('❌ Chỉ chấp nhận ảnh JPG, PNG, WebP hoặc GIF!');
    if (attachment.size > 8 * 1024 * 1024) return message.reply('❌ Ảnh quá lớn! Tối đa 8MB.');

    const loadingMsg = await message.reply('⏳ Đang tải ảnh...');
    try {
      const https = require('https'), http = require('http');
      const ext   = attachment.contentType.includes('png') ? 'png' : attachment.contentType.includes('gif') ? 'gif' : attachment.contentType.includes('webp') ? 'webp' : 'jpg';
      const filePath = path.join(BG_DIR, `${guild.id}_${message.author.id}.${ext}`);

      await new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        const cli  = attachment.url.startsWith('https') ? https : http;
        cli.get(attachment.url, res => { res.pipe(file); file.on('finish', () => { file.close(); resolve(); }); }).on('error', err => { fs.unlink(filePath, ()=>{}); reject(err); });
      });

      setUserBG(guild.id, message.author.id, filePath);
      await loadingMsg.delete().catch(() => {});
      message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🖼️ Đã cập nhật ảnh nền rank card!').setDescription('Dùng `.rank` để xem thành quả!').setThumbnail(attachment.url).setFooter({ text: 'Dùng .resetbg để xóa ảnh nền tùy chỉnh' }).setTimestamp()] });
    } catch (err) { await loadingMsg.delete().catch(() => {}); message.reply(`❌ Không tải được ảnh: ${err.message}`); }
  }

  // .resetbg
  if (content === '.resetbg') {
    const bgPath = getUserBG(guild.id, message.author.id);
    if (!bgPath) return message.reply('❌ Bạn chưa có ảnh nền tùy chỉnh!');
    try { fs.unlinkSync(bgPath); } catch {}
    const bgDb = loadBG(); delete bgDb[`${guild.id}_${message.author.id}`]; saveBG(bgDb);
    message.reply({ embeds: [new EmbedBuilder().setColor(0xFF6600).setTitle('🔄 Đã xóa ảnh nền').setDescription('Rank card sẽ dùng nền mặc định.\nDùng `.setbg` để đặt ảnh mới!').setTimestamp()] });
  }

});

// ===================== HELPERS =====================
function parseTime(str) {
  const match = str?.match(/^(\d+)([smhdw])$/i); if (!match) return null;
  const map = { s:1000, m:60000, h:3600000, d:86400000, w:604800000 };
  return parseInt(match[1]) * (map[match[2].toLowerCase()] || 0);
}
function formatTime(ms) {
  const s=Math.floor(ms/1000),m=Math.floor(s/60),h=Math.floor(m/60),d=Math.floor(h/24);
  if(d>0)return`${d} ngày`;if(h>0)return`${h} giờ`;if(m>0)return`${m} phút`;return`${s} giây`;
}

// ===================== LOGIN =====================
client.login(TOKEN)
