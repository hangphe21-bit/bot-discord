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
} = require('discord.js');
const express = require('express');
const fs = require('fs');
const path = require('path');

// ===================== CONFIG =====================
const TOKEN = process.env.TOKEN || 'YOUR_BOT_TOKEN';
const CLIENT_ID = process.env.CLIENT_ID || 'YOUR_CLIENT_ID';

function loadAdmins() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'admins.json'), 'utf8');
    return JSON.parse(data).admins || [];
  } catch (e) {
    console.error('Không đọc được admins.json:', e.message);
    return [];
  }
}
function isAdmin(userId) { return loadAdmins().includes(userId); }

// ===================== EXPRESS (UptimeRobot) =====================
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
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Xem danh sach lenh'),

  new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Khoa kenh hien tai (chi Admin)'),

  new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Mo khoa kenh hien tai (chi Admin)'),

  new SlashCommandBuilder()
    .setName('role')
    .setDescription('Them role cho user (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('Chon user').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Chon role muon them').setRequired(true)),

  new SlashCommandBuilder()
    .setName('addroles')
    .setDescription('Them nhieu role cho user cung luc (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('Chon user').setRequired(true))
    .addRoleOption(opt => opt.setName('role1').setDescription('Role 1').setRequired(true))
    .addRoleOption(opt => opt.setName('role2').setDescription('Role 2').setRequired(false))
    .addRoleOption(opt => opt.setName('role3').setDescription('Role 3').setRequired(false))
    .addRoleOption(opt => opt.setName('role4').setDescription('Role 4').setRequired(false))
    .addRoleOption(opt => opt.setName('role5').setDescription('Role 5').setRequired(false)),

  new SlashCommandBuilder()
    .setName('deleterole')
    .setDescription('Xoa role khoi user (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('Chon user').setRequired(true))
    .addRoleOption(opt => opt.setName('role').setDescription('Chon role muon xoa').setRequired(true)),

  new SlashCommandBuilder()
    .setName('addrole')
    .setDescription('Tao role moi trong server (chi Admin)')
    .addStringOption(opt => opt.setName('ten').setDescription('Ten cua role').setRequired(true))
    .addStringOption(opt => opt.setName('mau').setDescription('Mau hex VD: #FF0000').setRequired(true)),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Xoa tin nhan trong kenh (chi Admin)')
    .addIntegerOption(opt =>
      opt.setName('soluong').setDescription('So tin nhan muon xoa (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)
    ),

  // /setrole — tạo panel role reaction
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Cam user nhan tin (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('User can mute').setRequired(true))
    .addStringOption(opt => opt.setName('time').setDescription('Thoi gian VD: 10m, 1h, 2d').setRequired(true))
    .addStringOption(opt => opt.setName('lydo').setDescription('Ly do mute').setRequired(false)),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Go mute user (chi Admin)')
    .addUserOption(opt => opt.setName('user').setDescription('User can unmute').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setrole')
    .setDescription('Tao panel chon role bang nut bam (chi Admin)')
    .addStringOption(opt => opt.setName('tieude').setDescription('Tieu de panel VD: Chon mau cua ban').setRequired(true))
    .addRoleOption(opt => opt.setName('role1').setDescription('Role 1 (bat buoc)').setRequired(true))
    .addStringOption(opt => opt.setName('icon1').setDescription('Emoji cho role 1 VD: 🔴').setRequired(true))
    .addRoleOption(opt => opt.setName('role2').setDescription('Role 2').setRequired(false))
    .addStringOption(opt => opt.setName('icon2').setDescription('Emoji cho role 2').setRequired(false))
    .addRoleOption(opt => opt.setName('role3').setDescription('Role 3').setRequired(false))
    .addStringOption(opt => opt.setName('icon3').setDescription('Emoji cho role 3').setRequired(false))
    .addRoleOption(opt => opt.setName('role4').setDescription('Role 4').setRequired(false))
    .addStringOption(opt => opt.setName('icon4').setDescription('Emoji cho role 4').setRequired(false))
    .addRoleOption(opt => opt.setName('role5').setDescription('Role 5').setRequired(false))
    .addStringOption(opt => opt.setName('icon5').setDescription('Emoji cho role 5').setRequired(false))
    .addChannelOption(opt => opt.setName('kenh').setDescription('Kenh de bot gui panel role VD: #role').setRequired(false))
    .addStringOption(opt => opt.setName('mota').setDescription('Mo ta them (khong bat buoc)').setRequired(false)),

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.once('ready', async () => {
  console.log(`Bot online: ${client.user.tag}`);
  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Da dang ky slash commands!');
  } catch (err) {
    console.error('Loi dang ky lenh:', err);
  }
});

// ===================== SLASH COMMAND HANDLER =====================
client.on('interactionCreate', async (interaction) => {

  // ===== BUTTON CLICK (setrole panel) =====
  if (interaction.isButton() && interaction.customId.startsWith('setrole_')) {
    try {
      // customId format: setrole_ROLEID
      const roleId = interaction.customId.replace('setrole_', '');
      const role = interaction.guild.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({ content: '❌ Role không tồn tại!', ephemeral: true });
      }

      const member = interaction.member;

      if (member.roles.cache.has(roleId)) {
        // Đã có role → bỏ role
        await member.roles.remove(role);
        return interaction.reply({
          content: `✅ Đã bỏ role **${role.name}** khỏi bạn!`,
          ephemeral: true
        });
      } else {
        // Chưa có role → thêm role
        await member.roles.add(role);
        return interaction.reply({
          content: `✅ Đã thêm role **${role.name}** cho bạn!`,
          ephemeral: true
        });
      }
    } catch (err) {
      return interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  if (!interaction.isChatInputCommand()) return;

  const { commandName, user, member, guild, channel } = interaction;

  // -------- /help --------
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📋 Danh sách lệnh Bot')
      .addFields(
        {
          name: '👤 Lệnh mọi người dùng được',
          value: [
            '`.name [tên]` — Đổi nickname của bạn trong server',
            '`/help` — Hiển thị danh sách lệnh',
          ].join('\n'),
        },
        {
          name: '🔐 Lệnh Admin',
          value: [
            '`/lock` hoặc `.lock` — 🔒 Khóa kênh hiện tại',
            '`/unlock` hoặc `.unlock` — 🔓 Mở khóa kênh hiện tại',
            '`/role @user @role` — ➕ Thêm 1 role cho thành viên',
            '`/addroles @user @role1 @role2...` — ➕ Thêm nhiều role cùng lúc',
            '`/deleterole @user @role` — 🗑️ Xóa role khỏi thành viên',
            '`/addrole [tên] [màu]` — 🎨 Tạo role mới',
            '`/clear [số lượng]` — 🧹 Xóa tin nhắn trong kênh',
            '`/setrole [tiêu đề] [role] [icon]...` — 🎭 Tạo panel chọn role',
            '`/mute @user [time] [lý do]` — 🔇 Mute thành viên (10m/1h/2d)',
            '`/unmute @user` — 🔊 Gỡ mute thành viên',
          ].join('\n'),
        }
      )
      .setFooter({ text: 'Chỉ Admin mới dùng được lệnh có khóa 🔐' })
      .setTimestamp();
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // -------- /lock --------
  if (commandName === 'lock') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Bạn không có quyền khóa kênh!', ephemeral: true });
    }
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false, AddReactions: false, SendMessagesInThreads: false,
      });
      const embed = new EmbedBuilder()
        .setColor(0xFF0000).setTitle('🔒 Kênh đã bị khóa')
        .setDescription(`Kênh **#${channel.name}** đã bị khóa bởi ${user}\nMọi người không thể nhắn tin cho đến khi được mở khóa.`)
        .setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /unlock --------
  if (commandName === 'unlock') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: '❌ Bạn không có quyền mở khóa kênh!', ephemeral: true });
    }
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null, AddReactions: null, SendMessagesInThreads: null,
      });
      const embed = new EmbedBuilder()
        .setColor(0x00FF00).setTitle('🔓 Kênh đã được mở khóa')
        .setDescription(`Kênh **#${channel.name}** đã được mở khóa bởi ${user}\nMọi người có thể nhắn tin bình thường!`)
        .setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /role --------
  if (commandName === 'role') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ Bạn không có quyền thêm role!', ephemeral: true });
    }
    const targetUser = interaction.options.getMember('user');
    const targetRole = interaction.options.getRole('role');
    if (!targetUser || !targetRole) {
      return interaction.reply({ content: '❌ Không tìm thấy user hoặc role!', ephemeral: true });
    }
    if (targetUser.roles.cache.has(targetRole.id)) {
      return interaction.reply({ content: `❌ **${targetUser.user.username}** đã có role **${targetRole.name}** rồi!`, ephemeral: true });
    }
    try {
      await targetUser.roles.add(targetRole);
      const embed = new EmbedBuilder()
        .setColor(targetRole.color || 0x5865F2).setTitle('✅ Đã thêm Role')
        .setDescription(`Đã thêm role **${targetRole.name}** cho ${targetUser.user}\nThực hiện bởi: ${user}`)
        .setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /addroles (nhiều role cùng lúc) --------
  if (commandName === 'addroles') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ Bạn không có quyền thêm role!', ephemeral: true });
    }

    const targetUser = interaction.options.getMember('user');
    if (!targetUser) {
      return interaction.reply({ content: '❌ Không tìm thấy user!', ephemeral: true });
    }

    // Lấy tất cả role được chọn (role1 → role5)
    const rolesToAdd = [];
    for (let i = 1; i <= 5; i++) {
      const r = interaction.options.getRole(`role${i}`);
      if (r) rolesToAdd.push(r);
    }

    if (rolesToAdd.length === 0) {
      return interaction.reply({ content: '❌ Chưa chọn role nào!', ephemeral: true });
    }

    await interaction.deferReply();

    const added = [], skipped = [], failed = [];

    for (const r of rolesToAdd) {
      if (targetUser.roles.cache.has(r.id)) {
        skipped.push(r.name);
      } else {
        try {
          await targetUser.roles.add(r);
          added.push(r.name);
        } catch {
          failed.push(r.name);
        }
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('➕ Kết quả thêm nhiều Role')
      .setDescription(`Thành viên: ${targetUser.user}`)
      .setTimestamp();

    if (added.length > 0)   embed.addFields({ name: '✅ Đã thêm', value: added.map(r => `**${r}**`).join(', '), inline: false });
    if (skipped.length > 0) embed.addFields({ name: '⏭️ Đã có sẵn', value: skipped.map(r => `**${r}**`).join(', '), inline: false });
    if (failed.length > 0)  embed.addFields({ name: '❌ Thất bại', value: failed.map(r => `**${r}**`).join(', '), inline: false });

    interaction.editReply({ embeds: [embed] });
  }

  // -------- /deleterole --------
  if (commandName === 'deleterole') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ Bạn không có quyền xóa role!', ephemeral: true });
    }
    const targetUser = interaction.options.getMember('user');
    const targetRole = interaction.options.getRole('role');
    if (!targetUser || !targetRole) {
      return interaction.reply({ content: '❌ Không tìm thấy user hoặc role!', ephemeral: true });
    }
    if (!targetUser.roles.cache.has(targetRole.id)) {
      return interaction.reply({ content: `❌ **${targetUser.user.username}** không có role **${targetRole.name}**!`, ephemeral: true });
    }
    try {
      await targetUser.roles.remove(targetRole);
      const embed = new EmbedBuilder()
        .setColor(0xFF6600).setTitle('🗑️ Đã xóa Role')
        .setDescription(`Đã xóa role **${targetRole.name}** khỏi ${targetUser.user}\nThực hiện bởi: ${user}`)
        .setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /addrole (tạo role mới) --------
  if (commandName === 'addrole') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ Bạn không có quyền tạo role!', ephemeral: true });
    }
    const roleName  = interaction.options.getString('ten');
    const roleColor = interaction.options.getString('mau');
    const hexRegex  = /^#([0-9A-Fa-f]{6})$/;
    if (!hexRegex.test(roleColor)) {
      return interaction.reply({ content: '❌ Màu không hợp lệ! VD: `#FF0000`', ephemeral: true });
    }
    const existingRole = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
    if (existingRole) {
      return interaction.reply({ content: `❌ Role **${roleName}** đã tồn tại rồi!`, ephemeral: true });
    }
    try {
      const newRole = await guild.roles.create({
        name: roleName, color: roleColor,
        permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        reason: `Tao boi ${user.tag}`,
      });
      const embed = new EmbedBuilder()
        .setColor(newRole.color).setTitle('🎨 Đã tạo Role mới')
        .addFields(
          { name: '📛 Tên', value: newRole.name, inline: true },
          { name: '🎨 Màu', value: roleColor, inline: true },
          { name: '✅ Quyền', value: 'Xem kênh, Xem lịch sử tin nhắn', inline: false },
        )
        .setFooter({ text: `Tao boi ${user.tag}` }).setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /clear --------
  if (commandName === 'clear') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: '❌ Bạn không có quyền xóa tin nhắn!', ephemeral: true });
    }
    const amount = interaction.options.getInteger('soluong');
    try {
      await interaction.deferReply({ ephemeral: true });
      const messages = await channel.messages.fetch({ limit: amount });
      const deletable = messages.filter(msg => Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000);
      if (deletable.size === 0) {
        return interaction.editReply('❌ Không có tin nhắn nào xóa được! Tin nhắn quá 14 ngày Discord không cho xóa hàng loạt.');
      }
      await channel.bulkDelete(deletable, true);
      const embed = new EmbedBuilder()
        .setColor(0x5865F2).setTitle('🧹 Đã xóa tin nhắn')
        .setDescription(`Đã xóa **${deletable.size}** tin nhắn trong **#${channel.name}**\nThực hiện bởi: ${user}`)
        .setTimestamp();
      const reply = await interaction.editReply({ embeds: [embed], ephemeral: false });
      setTimeout(async () => { try { await reply.delete(); } catch {} }, 5000);
    } catch (err) {
      try { interaction.editReply({ content: `❌ Lỗi: ${err.message}` }); } catch {}
    }
  }

  // -------- /mute --------
  if (commandName === 'mute') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ Bạn không có quyền mute!', ephemeral: true });
    }

    const targetUser = interaction.options.getMember('user');
    const timeStr    = interaction.options.getString('time');
    const lydo       = interaction.options.getString('lydo') || 'Không có lý do';

    if (!targetUser) {
      return interaction.reply({ content: '❌ Không tìm thấy user!', ephemeral: true });
    }

    // Parse time: 10m, 1h, 2d, 1w
    function parseTime(str) {
      const match = str.match(/^(\d+)([smhdw])$/i);
      if (!match) return null;
      const val  = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const map  = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
      return val * (map[unit] || 0);
    }

    const ms = parseTime(timeStr);
    if (!ms || ms <= 0) {
      return interaction.reply({ content: '❌ Thời gian không hợp lệ!\nVD: `10m` (10 phút), `1h` (1 giờ), `2d` (2 ngày)', ephemeral: true });
    }

    // Discord timeout tối đa 28 ngày
    const MAX_MS = 28 * 24 * 60 * 60 * 1000;
    if (ms > MAX_MS) {
      return interaction.reply({ content: '❌ Tối đa chỉ được mute **28 ngày**!', ephemeral: true });
    }

    try {
      await targetUser.timeout(ms, lydo);

      // Format thời gian hiển thị
      function formatTime(ms) {
        const s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60), d = Math.floor(h/24);
        if (d > 0) return `${d} ngày`;
        if (h > 0) return `${h} giờ`;
        if (m > 0) return `${m} phút`;
        return `${s} giây`;
      }

      const embed = new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle('🔇 Đã Mute Thành Viên')
        .addFields(
          { name: '👤 Thành viên', value: `${targetUser.user}`, inline: true },
          { name: '⏱️ Thời gian', value: formatTime(ms), inline: true },
          { name: '📝 Lý do', value: lydo, inline: false },
          { name: '🔓 Hết mute lúc', value: `<t:${Math.floor((Date.now()+ms)/1000)}:F>`, inline: false },
        )
        .setFooter({ text: `Thực hiện bởi ${user.tag}` })
        .setTimestamp();

      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}\nBot cần quyền **Moderate Members** và role cao hơn user!`, ephemeral: true });
    }
  }

  // -------- /unmute --------
  if (commandName === 'unmute') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return interaction.reply({ content: '❌ Bạn không có quyền unmute!', ephemeral: true });
    }

    const targetUser = interaction.options.getMember('user');
    if (!targetUser) {
      return interaction.reply({ content: '❌ Không tìm thấy user!', ephemeral: true });
    }

    if (!targetUser.communicationDisabledUntil) {
      return interaction.reply({ content: `❌ **${targetUser.user.username}** không bị mute!`, ephemeral: true });
    }

    try {
      await targetUser.timeout(null);
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🔊 Đã Unmute Thành Viên')
        .setDescription(`${targetUser.user} đã được gỡ mute bởi ${user}`)
        .setTimestamp();
      interaction.reply({ embeds: [embed] });
    } catch (err) {
      interaction.reply({ content: `❌ Lỗi: ${err.message}`, ephemeral: true });
    }
  }

  // -------- /setrole (tạo panel role) --------
  if (commandName === 'setrole') {
    if (!isAdmin(user.id) && !member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: '❌ Bạn không có quyền tạo panel role!', ephemeral: true });
    }

    const tieude = interaction.options.getString('tieude');
    const mota   = interaction.options.getString('mota') || '';

    // Gom các cặp role + icon
    const pairs = [];
    for (let i = 1; i <= 5; i++) {
      const r    = interaction.options.getRole(`role${i}`);
      const icon = interaction.options.getString(`icon${i}`);
      if (r && icon) pairs.push({ role: r, icon });
    }

    if (pairs.length === 0) {
      return interaction.reply({ content: '❌ Cần ít nhất 1 cặp role + icon!', ephemeral: true });
    }

    // Tạo embed panel
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(tieude)
      .setDescription(
        (mota ? mota + '\n\n' : '') +
        '**Click vào nút bên dưới để nhận/bỏ role:**\n' +
        pairs.map(p => `${p.icon} → **${p.role.name}**`).join('\n')
      )
      .setFooter({ text: 'Click lần nữa để bỏ role' })
      .setTimestamp();

    // Tạo buttons (tối đa 5 button / 1 row)
    const row = new ActionRowBuilder();
    pairs.forEach(p => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`setrole_${p.role.id}`)
          .setLabel(p.role.name)
          .setEmoji(p.icon)
          .setStyle(ButtonStyle.Primary)
      );
    });

    // Kênh gửi panel (nếu có)
    const targetChannel = interaction.options.getChannel('kenh') || channel;

    try {
      await targetChannel.send({ embeds: [embed], components: [row] });
      // Nếu gửi sang kênh khác thì báo cho admin biết
      if (targetChannel.id !== channel.id) {
        await interaction.reply({ content: `✅ Đã gửi panel role sang ${targetChannel}!`, ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], components: [row] });
      }
    } catch (err) {
      interaction.reply({ content: `❌ Không thể gửi vào kênh đó! Kiểm tra quyền bot.\nLỗi: ${err.message}`, ephemeral: true });
    }
  }
});

// ===================== PREFIX COMMAND HANDLER =====================
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const member  = message.member;
  const guild   = message.guild;
  const channel = message.channel;

  // .name
  if (content.startsWith('.name ')) {
    const newName = content.slice(6).trim();
    if (!newName) return message.reply('❌ Vui lòng nhập tên! VD: `.name TênMới`');
    if (newName.length > 32) return message.reply('❌ Tên quá dài! Tối đa 32 ký tự.');
    try {
      await member.setNickname(newName);
      message.reply(`✅ Đã đổi nickname thành **${newName}**!`);
    } catch (err) {
      message.reply('❌ Không thể đổi tên! Bot cần role cao hơn bạn.');
    }
  }

  // .lock
  if (content === '.lock') {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ Bạn không có quyền khóa kênh!');
    }
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false, AddReactions: false, SendMessagesInThreads: false,
      });
      const embed = new EmbedBuilder()
        .setColor(0xFF0000).setTitle('🔒 Kênh đã bị khóa')
        .setDescription(`Kênh **#${channel.name}** đã bị khóa bởi ${message.author}\nMọi người không thể nhắn tin cho đến khi được mở khóa.`)
        .setTimestamp();
      channel.send({ embeds: [embed] });
    } catch (err) { message.reply(`❌ Lỗi: ${err.message}`); }
  }

  // .mute @user [time] [lý do]
  if (content.startsWith('.mute ')) {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Bạn không có quyền mute!');
    }

    const args = content.split(/\s+/);
    // args[0] = .mute, args[1] = @user, args[2] = time, args[3...] = lý do
    const mentionId = args[1]?.replace(/[<@!>]/g, '');
    const timeStr   = args[2];
    const lydo      = args.slice(3).join(' ') || 'Không có lý do';

    if (!mentionId || !timeStr) {
      return message.reply('❌ Cú pháp: `.mute @user [time] [lý do]`\nVD: `.mute @NaNaNa 10m Spam`');
    }

    function parseTime(str) {
      const match = str.match(/^(\d+)([smhdw])$/i);
      if (!match) return null;
      const val = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      const map = { s:1000, m:60000, h:3600000, d:86400000, w:604800000 };
      return val * (map[unit] || 0);
    }

    function formatTime(ms) {
      const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60), d=Math.floor(h/24);
      if (d>0) return `${d} ngày`;
      if (h>0) return `${h} giờ`;
      if (m>0) return `${m} phút`;
      return `${s} giây`;
    }

    const ms = parseTime(timeStr);
    if (!ms) return message.reply('❌ Thời gian không hợp lệ! VD: `10m`, `1h`, `2d`');

    const MAX_MS = 28 * 24 * 60 * 60 * 1000;
    if (ms > MAX_MS) return message.reply('❌ Tối đa chỉ được mute **28 ngày**!');

    try {
      const targetMember = await guild.members.fetch(mentionId).catch(() => null);
      if (!targetMember) return message.reply('❌ Không tìm thấy user!');

      await targetMember.timeout(ms, lydo);

      const embed = new EmbedBuilder()
        .setColor(0xFF6600)
        .setTitle('🔇 Đã Mute Thành Viên')
        .addFields(
          { name: '👤 Thành viên', value: `${targetMember.user}`, inline: true },
          { name: '⏱️ Thời gian', value: formatTime(ms), inline: true },
          { name: '📝 Lý do', value: lydo, inline: false },
          { name: '🔓 Hết mute lúc', value: `<t:${Math.floor((Date.now()+ms)/1000)}:F>`, inline: false },
        )
        .setFooter({ text: `Thực hiện bởi ${message.author.tag}` })
        .setTimestamp();

      message.reply({ embeds: [embed] });
    } catch (err) {
      message.reply(`❌ Lỗi: ${err.message}\nBot cần quyền **Moderate Members** và role cao hơn user!`);
    }
  }

  // .unmute @user
  if (content.startsWith('.unmute ')) {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply('❌ Bạn không có quyền unmute!');
    }

    const args = content.split(/\s+/);
    const mentionId = args[1]?.replace(/[<@!>]/g, '');
    if (!mentionId) return message.reply('❌ Cú pháp: `.unmute @user`');

    try {
      const targetMember = await guild.members.fetch(mentionId).catch(() => null);
      if (!targetMember) return message.reply('❌ Không tìm thấy user!');

      if (!targetMember.communicationDisabledUntil) {
        return message.reply(`❌ **${targetMember.user.username}** không bị mute!`);
      }

      await targetMember.timeout(null);
      const embed = new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🔊 Đã Unmute Thành Viên')
        .setDescription(`${targetMember.user} đã được gỡ mute bởi ${message.author}`)
        .setTimestamp();
      message.reply({ embeds: [embed] });
    } catch (err) {
      message.reply(`❌ Lỗi: ${err.message}`);
    }
  }

  // .unlock
  if (content === '.unlock') {
    if (!isAdmin(message.author.id) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return message.reply('❌ Bạn không có quyền mở khóa kênh!');
    }
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: null, AddReactions: null, SendMessagesInThreads: null,
      });
      const embed = new EmbedBuilder()
        .setColor(0x00FF00).setTitle('🔓 Kênh đã được mở khóa')
        .setDescription(`Kênh **#${channel.name}** đã được mở khóa bởi ${message.author}\nMọi người có thể nhắn tin bình thường!`)
        .setTimestamp();
      channel.send({ embeds: [embed] });
    } catch (err) { message.reply(`❌ Lỗi: ${err.message}`); }
  }
});

// ===================== LOGIN =====================
client.login(TOKEN);

